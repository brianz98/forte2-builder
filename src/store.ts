import { create } from "zustand";
import { catalogVersions, getCatalog } from "./catalog";
import type { Catalog } from "./catalog/types";
import type { GraphDoc, GraphFile, GraphMeta } from "./graph/types";
import { parseGraphFile, serializeGraph } from "./graph/io";
import * as ops from "./graph/ops";
import { analyze, attachProblems, type Analysis } from "./rules/analyze";
import { templates } from "./templates";
import { connectionFixes, type Fix } from "./rules/fixes";
import { seedNewStates as seedStates } from "./chem/state";

export type Theme = "system" | "light" | "dark";

// Visual variants, switchable from the design panel so they can be compared
// in the browser.
export interface DesignPrefs {
  theme: Theme;
  direction: "RIGHT" | "DOWN";
  density: "detailed" | "compact";
  slots: "docked" | "separate";
  edge: "smoothstep" | "bezier" | "step" | "straight";
  accent: "top" | "left" | "tint";
  twoComponent: "badge" | "stripe" | "edge";
  autoLayout: boolean;
  minimap: boolean;
}

export const defaultDesign: DesignPrefs = {
  theme: "system",
  direction: "DOWN",
  density: "detailed",
  slots: "docked",
  edge: "smoothstep",
  accent: "top",
  twoComponent: "badge",
  autoLayout: true,
  minimap: false,
};

export interface XY {
  x: number;
  y: number;
}

interface Toast {
  message: string;
  kind: "info" | "error";
  nonce: number;
  fixes?: Fix[];
}

interface CommitOptions {
  select?: string | null;
  relayout?: boolean;
  fit?: boolean;
  // Consecutive edits with the same key replace each other in the undo history.
  coalesce?: string;
}

export interface Store {
  version: string;
  catalog: Catalog;
  catalogProblems: string[];
  doc: GraphDoc;
  meta: GraphMeta & { templateId?: string };
  analysis: Analysis;
  selectedId?: string;
  past: GraphDoc[];
  future: GraphDoc[];
  layout: { nonce: number; fit: boolean };
  // Bumped when a whole new graph replaces the current one.
  generation: number;
  placement: Record<string, XY>;
  design: DesignPrefs;
  showDesign: boolean;
  rightTab: "inspect" | "code";
  templatesOpen: boolean;
  toast?: Toast;
  lastEdit?: { key: string; at: number };

  commit(doc: GraphDoc, opts?: CommitOptions): void;
  loadGraph(file: GraphFile, templateId?: string): void;
  newGraph(): void;
  select(id?: string): void;
  addNode(type: string, at?: XY): void;
  connect(parent: string, child: string): boolean;
  disconnect(child: string): void;
  setOption(id: string, name: string, value: unknown): void;
  addSlotChild(ownerId: string, slot: string, type: string): void;
  removeNode(id: string): void;
  changeType(id: string, type: string): void;
  applyFix(fix: Fix): void;
  explainConnection(parent: string, child: string): void;
  undo(): void;
  redo(): void;
  requestLayout(fit?: boolean): void;
  setDesign(patch: Partial<DesignPrefs>): void;
  setShowDesign(show: boolean): void;
  setRightTab(tab: Store["rightTab"]): void;
  setTemplatesOpen(open: boolean): void;
  showToast(message: string, kind?: Toast["kind"], fixes?: Fix[]): void;
  dismissToast(): void;
  exportFile(): GraphFile;
}

const STORAGE = { doc: "forte2-builder:graph", design: "forte2-builder:design" };

function readStorage<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private windows, blocked site data).
  }
}

function initialGraph(catalog: Catalog): { doc: GraphDoc; meta: Store["meta"] } {
  const saved = readStorage<GraphFile & { templateId?: string }>(STORAGE.doc);
  if (saved) {
    try {
      const { nodes: _nodes, format: _format, templateId, ...meta } = saved;
      return { doc: parseGraphFile(saved), meta: { ...meta, templateId } };
    } catch {
      // Fall through to the first template.
    }
  }
  const first = templates[0];
  if (!first) return { doc: { nodes: {} }, meta: {} };
  const { nodes: _nodes, format: _format, ...meta } = first.file;
  void catalog;
  return { doc: parseGraphFile(first.file), meta: { ...meta, templateId: first.id } };
}

const version = catalogVersions[0];
const { catalog, problems } = getCatalog(version);
const init = initialGraph(catalog);

export const useStore = create<Store>((set, get) => ({
  version,
  catalog,
  catalogProblems: problems,
  doc: init.doc,
  meta: init.meta,
  analysis: analyze(init.doc, catalog),
  past: [],
  future: [],
  layout: { nonce: 1, fit: true },
  generation: 0,
  placement: {},
  design: { ...defaultDesign, ...(readStorage<Partial<DesignPrefs>>(STORAGE.design) ?? {}) },
  showDesign: false,
  rightTab: "inspect",
  templatesOpen: false,

  commit(doc, opts = {}) {
    const s = get();
    const now = Date.now();
    const coalesce =
      opts.coalesce && s.lastEdit?.key === opts.coalesce && now - s.lastEdit.at < 1500;
    set({
      doc,
      analysis: analyze(doc, s.catalog),
      past: coalesce ? s.past : [...s.past.slice(-99), s.doc],
      future: [],
      lastEdit: opts.coalesce ? { key: opts.coalesce, at: now } : undefined,
      ...(opts.select !== undefined ? { selectedId: opts.select ?? undefined } : {}),
      ...(opts.relayout ? { layout: { nonce: s.layout.nonce + 1, fit: !!opts.fit } } : {}),
    });
  },

  loadGraph(file, templateId) {
    try {
      const doc = parseGraphFile(file);
      const { nodes: _nodes, format: _format, ...meta } = file;
      set({
        meta: { ...meta, templateId },
        templatesOpen: false,
        placement: {},
        generation: get().generation + 1,
      });
      get().commit(doc, { select: null, relayout: true, fit: true });
    } catch (e) {
      get().showToast(e instanceof Error ? e.message : String(e), "error");
    }
  },

  newGraph() {
    const { doc, id } = ops.createNode({ nodes: {} }, get().catalog, "System");
    set({ meta: { title: "Untitled" }, placement: {}, generation: get().generation + 1 });
    get().commit(doc, { select: id, relayout: true, fit: true });
  },

  select(id) {
    set({ selectedId: id, rightTab: id ? "inspect" : get().rightTab });
  },

  addNode(type, at) {
    const s = get();
    const def = s.catalog.nodes[type];
    const sel = s.selectedId ? s.doc.nodes[s.selectedId] : undefined;

    if (def.kind === "solver" || def.kind === "value") {
      const slot = sel && Object.entries(s.catalog.nodes[sel.type]?.slots ?? {}).find(([, d]) => d.accepts.includes(type));
      if (!sel || !slot) {
        s.showToast(`Select a node that takes ${type} first.`);
        return;
      }
      const upstream = ops.chainNodeOf(s.doc, sel.id).parent;
      const { doc, id } = ops.addSlotChild(s.doc, s.catalog, sel.id, slot[0], type, {
        upstreamAttrs: upstream ? s.analysis.facts[upstream]?.attrs : undefined,
      });
      s.commit(seedStates(s.doc, doc, s.catalog), { select: id, relayout: true });
      return;
    }

    const chain = sel ? ops.chainNodeOf(s.doc, sel.id) : undefined;
    const parent =
      def.kind !== "system" && chain && s.analysis.facts[chain.id] &&
      attachProblems(s.catalog, s.doc, type, chain, s.analysis.facts[chain.id]).length === 0
        ? chain
        : undefined;
    const { doc, id } = ops.createNode(
      s.doc,
      s.catalog,
      type,
      { parent: parent?.id },
      { upstreamAttrs: parent ? s.analysis.facts[parent.id]?.attrs : undefined },
    );
    if (at) set({ placement: { ...s.placement, [id]: at } });
    s.commit(seedStates(s.doc, doc, s.catalog), { select: id, relayout: !at });
  },

  connect(parentId, childId) {
    const s = get();
    if (connectionProblem(s, parentId, childId)) {
      s.explainConnection(parentId, childId);
      return false;
    }
    s.commit(ops.setParent(s.doc, childId, parentId), { relayout: true });
    return true;
  },

  disconnect(childId) {
    const s = get();
    s.commit(ops.setParent(s.doc, childId, undefined), { relayout: true });
  },

  setOption(id, name, value) {
    const s = get();
    s.commit(ops.setOption(s.doc, id, name, value), { coalesce: `${id}:${name}` });
  },

  addSlotChild(ownerId, slot, type) {
    const s = get();
    const upstream = ops.chainNodeOf(s.doc, ownerId).parent;
    const { doc, id } = ops.addSlotChild(s.doc, s.catalog, ownerId, slot, type, {
      upstreamAttrs: upstream ? s.analysis.facts[upstream]?.attrs : undefined,
    });
    s.commit(seedStates(s.doc, doc, s.catalog), { select: id, relayout: true });
  },

  removeNode(id) {
    const s = get();
    const owner = s.doc.nodes[id]?.owner?.id;
    s.commit(ops.removeNode(s.doc, id), { select: owner ?? null, relayout: true });
  },

  changeType(id, type) {
    const s = get();
    const upstream = ops.chainNodeOf(s.doc, id).parent;
    const doc = ops.changeType(s.doc, s.catalog, id, type, {
      upstreamAttrs: upstream ? s.analysis.facts[upstream]?.attrs : undefined,
    });
    s.commit(seedStates(s.doc, doc, s.catalog), { relayout: true });
  },

  applyFix(fix) {
    set({ toast: undefined });
    get().commit(fix.doc, { select: fix.select ?? null, relayout: true });
  },

  explainConnection(parentId, childId) {
    const s = get();
    const problem = connectionProblem(s, parentId, childId);
    if (!problem) return;
    s.showToast(problem, "error", connectionFixes(s.doc, s.catalog, parentId, childId));
  },

  undo() {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({
      doc: prev,
      analysis: analyze(prev, s.catalog),
      past: s.past.slice(0, -1),
      future: [s.doc, ...s.future],
      lastEdit: undefined,
      selectedId: s.selectedId && prev.nodes[s.selectedId] ? s.selectedId : undefined,
      layout: { nonce: s.layout.nonce + 1, fit: false },
    });
  },

  redo() {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({
      doc: next,
      analysis: analyze(next, s.catalog),
      past: [...s.past, s.doc],
      future: s.future.slice(1),
      lastEdit: undefined,
      selectedId: s.selectedId && next.nodes[s.selectedId] ? s.selectedId : undefined,
      layout: { nonce: s.layout.nonce + 1, fit: false },
    });
  },

  requestLayout(fit = true) {
    set({ layout: { nonce: get().layout.nonce + 1, fit }, placement: {} });
  },

  setDesign(patch) {
    const design = { ...get().design, ...patch };
    set({ design });
    writeStorage(STORAGE.design, design);
    if ("direction" in patch || "density" in patch || "slots" in patch) get().requestLayout(true);
  },

  setShowDesign(show) {
    set({ showDesign: show });
  },

  setRightTab(tab) {
    set({ rightTab: tab });
  },

  setTemplatesOpen(open) {
    set({ templatesOpen: open });
  },

  showToast(message, kind = "info", fixes) {
    set({ toast: { message, kind, nonce: Date.now(), fixes: fixes?.length ? fixes : undefined } });
  },

  dismissToast() {
    set({ toast: undefined });
  },

  exportFile() {
    const s = get();
    const { templateId: _t, ...meta } = s.meta;
    return serializeGraph(s.doc, { ...meta, forte2_version: s.catalog.forte2_version });
  },
}));

// Why `child` can't be connected below `parent`, or undefined when it can.
export function connectionProblem(s: Store, parentId: string, childId: string): string | undefined {
  if (parentId === childId) return "A node can't follow itself.";
  const parent = s.doc.nodes[parentId];
  const child = s.doc.nodes[childId];
  if (!parent || !child || parent.owner || child.owner) return "Only top-level nodes connect.";
  if (ops.isAncestor(s.doc, childId, parentId)) return "That connection would make a loop.";
  const facts = s.analysis.facts[parentId];
  if (!facts) return `${parent.type} isn't a method.`;
  const problems = attachProblems(s.catalog, s.doc, child.type, parent, facts, child);
  return problems[0]?.message;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc && s.meta === prev.meta) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeStorage(STORAGE.doc, { ...s.exportFile(), templateId: s.meta.templateId });
  }, 300);
});
