import type { FileNode, GraphDoc, GraphFile, GraphMeta, GraphNode } from "./types";
import { chainOrder } from "./ops";

export const GRAPH_FORMAT = "forte2-graph/1";

export function parseGraphFile(file: GraphFile): GraphDoc {
  if (file.format !== GRAPH_FORMAT) {
    throw new Error(`Unsupported graph format ${String(file.format)}; expected ${GRAPH_FORMAT}.`);
  }
  const doc: GraphDoc = { nodes: {} };
  const take = (id: string) => {
    let unique = id;
    for (let i = 2; unique in doc.nodes; i++) unique = `${id}${i}`;
    return unique;
  };

  const add = (fn: FileNode, id: string, extra: Partial<GraphNode>): string => {
    const node: GraphNode = {
      id,
      type: fn.type,
      options: { ...(fn.options ?? {}) },
      slots: {},
      ...extra,
    };
    doc.nodes[id] = node;
    for (const [slot, value] of Object.entries(fn.slots ?? {})) {
      const children = Array.isArray(value) ? value : [value];
      node.slots[slot] = children.map((child, i) => {
        const suffix = children.length > 1 ? String(i + 1) : "";
        const childId = take(child.id ?? `${id}.${slot}${suffix}`);
        return add(child, childId, { owner: { id, slot } });
      });
    }
    return id;
  };

  for (const [i, fn] of file.nodes.entries()) {
    add(fn, take(fn.id ?? `node${i + 1}`), fn.parent ? { parent: fn.parent } : {});
  }
  for (const node of Object.values(doc.nodes)) {
    if (node.parent && !doc.nodes[node.parent]) {
      throw new Error(`Node ${node.id} names a parent ${node.parent} that doesn't exist.`);
    }
  }
  return doc;
}

export function serializeGraph(
  doc: GraphDoc,
  meta: GraphMeta & { forte2_version?: string } = {},
): GraphFile {
  const nest = (node: GraphNode, withId: boolean): FileNode => {
    const out: FileNode = { ...(withId ? { id: node.id } : {}), type: node.type };
    if (node.parent) out.parent = node.parent;
    if (Object.keys(node.options).length) out.options = { ...node.options };
    const slots: Record<string, FileNode | FileNode[]> = {};
    for (const [slot, ids] of Object.entries(node.slots)) {
      const children = ids.map((id) => nest(doc.nodes[id], false));
      if (children.length === 1) slots[slot] = children[0];
      else if (children.length > 1) slots[slot] = children;
    }
    if (Object.keys(slots).length) out.slots = slots;
    return out;
  };

  const nodes = chainOrder(doc).map((id) => nest(doc.nodes[id], true));
  return { format: GRAPH_FORMAT, ...meta, nodes };
}
