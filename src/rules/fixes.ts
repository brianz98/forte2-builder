import type { Catalog } from "../catalog/types";
import type { GraphDoc, GraphNode } from "../graph/types";
import * as ops from "../graph/ops";
import { seedNewStates } from "../chem/state";
import { analyze, attachProblems, type Analysis, type Issue } from "./analyze";

export type FixKind = "connect" | "insert" | "switch" | "switch-upstream";

export interface Fix {
  kind: FixKind;
  label: string;
  // The whole graph after the fix, ready to commit.
  doc: GraphDoc;
  select?: string;
  // Errors left in the graph after the fix.
  errors: number;
}

// Display order, and how many fixes of each kind to offer.
const KINDS: [FixKind, number][] = [
  ["connect", 3],
  ["insert", 1],
  ["switch", 1],
  ["switch-upstream", 1],
];

interface Candidate {
  kind: FixKind;
  label: string;
  build: () => { doc: GraphDoc; select?: string };
}

// Changes of one step that remove `issue` and lower the graph's error count:
// connecting a loose node, inserting a node before it, or switching it or its
// upstream method to another type in the same family.
export function suggestFixes(
  doc: GraphDoc,
  catalog: Catalog,
  issue: Issue,
  analysis: Analysis = analyze(doc, catalog),
): Fix[] {
  if (issue.severity !== "error") return [];
  const node = doc.nodes[issue.nodeId];
  if (!node || !catalog.nodes[node.type]) return [];
  const chain = ops.chainNodeOf(doc, node.id);
  const chainDef = catalog.nodes[chain.type];
  const parent = chain.parent ? doc.nodes[chain.parent] : undefined;
  const attrsOf = (id?: string) => (id ? analysis.facts[id]?.attrs : undefined);
  const candidates: Candidate[] = [];
  const isMethod = (kind?: string) => kind === "method" || kind === "driver";

  if (!parent && isMethod(chainDef?.kind)) {
    const tops = Object.values(doc.nodes).filter((n) => !n.owner && n.id !== chain.id);
    for (const target of tops) {
      const facts = analysis.facts[target.id];
      if (!facts || ops.isAncestor(doc, chain.id, target.id)) continue;
      if (attachProblems(catalog, doc, chain.type, target, facts, chain).length) continue;
      const twin = tops.some((t) => t !== target && t.type === target.type);
      candidates.push({
        kind: "connect",
        label: `Connect after ${target.type}${twin ? ` (${target.id})` : ""}`,
        build: () => ({ doc: ops.setParent(doc, chain.id, target.id), select: chain.id }),
      });
    }
  }

  if (parent && isMethod(chainDef?.kind)) {
    const pfacts = analysis.facts[parent.id];
    for (const def of Object.values(catalog.nodes)) {
      if (!isMethod(def.kind) || !pfacts) continue;
      if (attachProblems(catalog, doc, def.name, parent, pfacts).length) continue;
      candidates.push({
        kind: "insert",
        label: `Insert ${def.name} between ${parent.type} and ${chain.type}`,
        build: () => {
          const r = ops.insertBetween(doc, catalog, parent.id, chain.id, def.name, {
            upstreamAttrs: pfacts.attrs,
          });
          return { doc: r.doc, select: r.id };
        },
      });
    }
  }

  for (const def of ops.familyOf(catalog, node.type)) {
    candidates.push({
      kind: "switch",
      label: `Switch ${node.type} to ${def.name}`,
      build: () => ({
        doc: ops.changeType(doc, catalog, node.id, def.name, { upstreamAttrs: attrsOf(chain.parent) }),
        select: node.id,
      }),
    });
  }

  if (parent && catalog.nodes[parent.type]?.kind !== "system") {
    for (const def of ops.familyOf(catalog, parent.type)) {
      candidates.push({
        kind: "switch-upstream",
        label: `Switch ${parent.type} to ${def.name}`,
        build: () => ({
          doc: ops.changeType(doc, catalog, parent.id, def.name, {
            upstreamAttrs: attrsOf(parent.parent),
          }),
          select: node.id,
        }),
      });
    }
  }

  const errorsOn = (a: Analysis, id: string) =>
    (a.byNode[id] ?? []).filter((i) => i.severity === "error");
  const ranked: (Fix & { left: number })[] = [];
  for (const c of candidates) {
    const built = c.build();
    const next = seedNewStates(doc, built.doc, catalog);
    const after = analyze(next, catalog);
    const left = errorsOn(after, issue.nodeId);
    // The failed check must pass, not just change its wording, and the graph
    // must end up with fewer errors overall.
    if (left.some((i) => i.code === issue.code) || after.errors >= analysis.errors) continue;
    ranked.push({
      kind: c.kind,
      label: c.label,
      doc: next,
      select: built.select,
      errors: after.errors,
      left: left.length,
    });
  }

  // Prefer fixes that leave this node clean, then the fewest errors overall;
  // ties keep catalog order.
  return KINDS.flatMap(([kind, limit]) =>
    ranked
      .filter((f) => f.kind === kind)
      .sort((a, b) => a.left - b.left || a.errors - b.errors)
      .slice(0, limit)
      .map(({ left: _left, ...fix }) => fix),
  );
}

// Fixes for connecting `childId` below `parentId`, when the connection itself
// is invalid. Each fix's graph includes the connection.
export function connectionFixes(
  doc: GraphDoc,
  catalog: Catalog,
  parentId: string,
  childId: string,
): Fix[] {
  const child: GraphNode | undefined = doc.nodes[childId];
  if (!child || !doc.nodes[parentId] || ops.isAncestor(doc, childId, parentId)) return [];
  const linked = ops.setParent(doc, childId, parentId);
  const analysis = analyze(linked, catalog);
  const related = new Set([childId, ...ops.slotDescendants(linked, childId)]);
  const issue = analysis.issues.find(
    (i) => i.connection && i.severity === "error" && related.has(i.nodeId),
  );
  return issue ? suggestFixes(linked, catalog, issue, analysis) : [];
}
