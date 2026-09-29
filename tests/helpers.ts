import { getCatalog } from "../src/catalog";
import { analyze } from "../src/rules/analyze";
import { parseGraphFile } from "../src/graph/io";
import type { FileNode, GraphDoc } from "../src/graph/types";

export const catalog = getCatalog().catalog;

export function graph(...nodes: FileNode[]): GraphDoc {
  return parseGraphFile({ format: "forte2-graph/1", nodes });
}

export function messages(doc: GraphDoc, severity: "error" | "warning" = "error"): string[] {
  return analyze(doc, catalog)
    .issues.filter((i) => i.severity === severity)
    .map((i) => `${i.nodeId}: ${i.message}`);
}

export const n2: FileNode = {
  id: "system",
  type: "System",
  options: { xyz: "N 0 0 0\nN 0 0 1.1", basis_set: "cc-pvdz", auxiliary_basis_set: "cc-pvtz-jkfit" },
};

export const state: FileNode = { type: "State", options: { nel: 14, multiplicity: 1, ms: 0.0 } };
