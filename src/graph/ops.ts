import type { Catalog, NodeDef, Scalar, SlotDef } from "../catalog/types";
import type { GraphDoc, GraphNode } from "./types";

// Top-level nodes (everything not owned by a slot), parents before children.
// Nodes whose parent is missing are treated as roots.
export function chainOrder(doc: GraphDoc): string[] {
  const top = Object.values(doc.nodes).filter((n) => !n.owner);
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of top) {
    if (n.parent && doc.nodes[n.parent]) {
      children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
    } else {
      roots.push(n.id);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const c of children.get(id) ?? []) visit(c);
  };
  roots.forEach(visit);
  // Anything left over sits on a cycle; list it rather than drop it.
  top.forEach((n) => visit(n.id));
  return out;
}

export function childrenOf(doc: GraphDoc, id: string): string[] {
  return Object.values(doc.nodes)
    .filter((n) => n.parent === id && !n.owner)
    .map((n) => n.id);
}

// The top-level node that (transitively) owns `id`, or `id` itself.
export function chainNodeOf(doc: GraphDoc, id: string): GraphNode {
  let node = doc.nodes[id];
  while (node.owner) node = doc.nodes[node.owner.id];
  return node;
}

export function slotDescendants(doc: GraphDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (nid: string) => {
    for (const ids of Object.values(doc.nodes[nid].slots)) {
      for (const c of ids) {
        out.push(c);
        walk(c);
      }
    }
  };
  walk(id);
  return out;
}

export function isAncestor(doc: GraphDoc, maybeAncestor: string, id: string): boolean {
  let cur = doc.nodes[id]?.parent;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === maybeAncestor) return true;
    seen.add(cur);
    cur = doc.nodes[cur]?.parent;
  }
  return false;
}

export function rootSystemOf(doc: GraphDoc, catalog: Catalog, id: string): GraphNode | undefined {
  let node: GraphNode | undefined = chainNodeOf(doc, id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (catalog.nodes[node.type]?.kind === "system") return node;
    seen.add(node.id);
    node = node.parent ? doc.nodes[node.parent] : undefined;
  }
  return undefined;
}

function clone(doc: GraphDoc): GraphDoc {
  return structuredClone(doc);
}

export function newId(doc: GraphDoc, def: NodeDef): string {
  const base = def.var ?? def.name.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
  if (!(base in doc.nodes)) return base;
  for (let i = 2; ; i++) if (!(`${base}${i}` in doc.nodes)) return `${base}${i}`;
}

export interface CreateContext {
  // Attributes of the method the new node will bind to, used to pick a
  // compatible type for required slots (for example a two-component solver
  // under GHF).
  upstreamAttrs?: Record<string, Scalar>;
}

export function pickSlotType(
  catalog: Catalog,
  slot: SlotDef,
  ctx: CreateContext,
): string {
  const attrs = ctx.upstreamAttrs ?? {};
  const fits = slot.accepts.find((t) => {
    const need = catalog.nodes[t]?.requires_attrs ?? {};
    return Object.entries(need).every(([k, v]) => !(k in attrs) || attrs[k] === v);
  });
  return fits ?? slot.accepts[0];
}

function addNode(
  doc: GraphDoc,
  catalog: Catalog,
  type: string,
  place: Partial<Pick<GraphNode, "parent" | "owner">>,
  ctx: CreateContext,
): string {
  const def = catalog.nodes[type];
  const id = newId(doc, def);
  const options: Record<string, unknown> = {};
  for (const [name, opt] of Object.entries(def.options)) {
    if (opt.example !== undefined) options[name] = structuredClone(opt.example);
  }
  doc.nodes[id] = { id, type, options, slots: {}, ...place };
  for (const [slot, sdef] of Object.entries(def.slots)) {
    if (!sdef.required) continue;
    const child = addNode(doc, catalog, pickSlotType(catalog, sdef, ctx), { owner: { id, slot } }, ctx);
    doc.nodes[id].slots[slot] = [child];
  }
  return id;
}

export function createNode(
  doc: GraphDoc,
  catalog: Catalog,
  type: string,
  place: { parent?: string } = {},
  ctx: CreateContext = {},
): { doc: GraphDoc; id: string } {
  const next = clone(doc);
  const id = addNode(next, catalog, type, place.parent ? { parent: place.parent } : {}, ctx);
  return { doc: next, id };
}

export function addSlotChild(
  doc: GraphDoc,
  catalog: Catalog,
  ownerId: string,
  slot: string,
  type: string,
  ctx: CreateContext = {},
): { doc: GraphDoc; id: string } {
  const next = clone(doc);
  const owner = next.nodes[ownerId];
  const sdef = catalog.nodes[owner.type].slots[slot];
  if (!sdef.many) {
    for (const old of owner.slots[slot] ?? []) removeInPlace(next, old);
    owner.slots[slot] = [];
  }
  const id = addNode(next, catalog, type, { owner: { id: ownerId, slot } }, ctx);
  owner.slots[slot] = [...(owner.slots[slot] ?? []), id];
  return { doc: next, id };
}

export function setParent(doc: GraphDoc, id: string, parent: string | undefined): GraphDoc {
  const next = clone(doc);
  if (parent) next.nodes[id].parent = parent;
  else delete next.nodes[id].parent;
  return next;
}

export function setOption(doc: GraphDoc, id: string, name: string, value: unknown): GraphDoc {
  const next = clone(doc);
  if (value === undefined) delete next.nodes[id].options[name];
  else next.nodes[id].options[name] = value;
  return next;
}

function removeInPlace(doc: GraphDoc, id: string) {
  const node = doc.nodes[id];
  if (!node) return;
  for (const c of slotDescendants(doc, id)) delete doc.nodes[c];
  if (node.owner) {
    const owner = doc.nodes[node.owner.id];
    if (owner) {
      owner.slots[node.owner.slot] = (owner.slots[node.owner.slot] ?? []).filter((c) => c !== id);
      if (owner.slots[node.owner.slot].length === 0) delete owner.slots[node.owner.slot];
    }
  }
  for (const other of Object.values(doc.nodes)) {
    if (other.parent === id) delete other.parent;
  }
  delete doc.nodes[id];
}

export function removeNode(doc: GraphDoc, id: string): GraphDoc {
  const next = clone(doc);
  removeInPlace(next, id);
  return next;
}

// Swap a node for another catalog type, keeping the options and slot contents
// the new type also accepts.
export function changeType(
  doc: GraphDoc,
  catalog: Catalog,
  id: string,
  type: string,
  ctx: CreateContext = {},
): GraphDoc {
  const next = clone(doc);
  const node = next.nodes[id];
  const def = catalog.nodes[type];
  node.type = type;
  node.options = Object.fromEntries(
    Object.entries(node.options).filter(([k]) => k in def.options),
  );
  for (const [slot, ids] of Object.entries(node.slots)) {
    const sdef = def.slots[slot];
    const keep = sdef ? ids.filter((c) => sdef.accepts.includes(next.nodes[c].type)) : [];
    for (const c of ids) if (!keep.includes(c)) removeInPlace(next, c);
    if (keep.length) node.slots[slot] = keep;
    else delete node.slots[slot];
  }
  for (const [slot, sdef] of Object.entries(def.slots)) {
    if (sdef.required && !(node.slots[slot]?.length)) {
      const child = addNode(next, catalog, pickSlotType(catalog, sdef, ctx), { owner: { id, slot } }, ctx);
      node.slots[slot] = [child];
    }
  }
  return next;
}
