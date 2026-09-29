import type { GraphDoc } from "../graph/types";
import type { DesignPrefs, XY } from "../store";

type Elk = InstanceType<typeof import("elkjs/lib/elk.bundled.js").default>;
let elkPromise: Promise<Elk> | undefined;

// ELK is large, so load it in its own chunk.
function getElk(): Promise<Elk> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  return elkPromise;
}

export interface Sized {
  id: string;
  width: number;
  height: number;
}

const INDENT = 28;
const STACK_GAP = 14;

// Place top-level nodes with ELK's layered algorithm. In "separate" slot mode,
// each owner and its slot subtree form one block: the owner on top and its
// constructor arguments stacked beneath it, indented by depth.
export async function layoutPositions(
  doc: GraphDoc,
  sized: Sized[],
  design: Pick<DesignPrefs, "direction" | "slots">,
): Promise<Record<string, XY>> {
  const size = new Map(sized.map((s) => [s.id, s]));
  const top = sized.filter((s) => doc.nodes[s.id] && !doc.nodes[s.id].owner);

  const stacks = new Map<string, { id: string; depth: number }[]>();
  if (design.slots === "separate") {
    for (const t of top) {
      const stack: { id: string; depth: number }[] = [];
      const walk = (id: string, depth: number) => {
        for (const ids of Object.values(doc.nodes[id].slots)) {
          for (const c of ids) {
            if (size.has(c)) stack.push({ id: c, depth });
            walk(c, depth + 1);
          }
        }
      };
      walk(t.id, 1);
      stacks.set(t.id, stack);
    }
  }

  const blocks = top.map((t) => {
    let width = t.width;
    let height = t.height;
    for (const { id, depth } of stacks.get(t.id) ?? []) {
      const s = size.get(id)!;
      width = Math.max(width, depth * INDENT + s.width);
      height += STACK_GAP + s.height;
    }
    return { id: t.id, width, height };
  });

  const ids = new Set(top.map((t) => t.id));
  const edges = top
    .filter((t) => doc.nodes[t.id].parent && ids.has(doc.nodes[t.id].parent!))
    .map((t) => ({ id: `${doc.nodes[t.id].parent}->${t.id}`, sources: [doc.nodes[t.id].parent!], targets: [t.id] }));

  const elk = await getElk();
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": design.direction,
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": design.direction === "DOWN" ? "44" : "72",
      "elk.spacing.componentComponent": "56",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: blocks,
    edges,
  });

  const out: Record<string, XY> = {};
  for (const child of result.children ?? []) {
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    out[child.id] = { x, y };
    let cursor = y + size.get(child.id)!.height;
    for (const { id, depth } of stacks.get(child.id) ?? []) {
      cursor += STACK_GAP;
      out[id] = { x: x + depth * INDENT, y: cursor };
      cursor += size.get(id)!.height;
    }
  }
  return out;
}
