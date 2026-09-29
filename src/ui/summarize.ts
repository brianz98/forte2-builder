import type { Catalog, NodeDef, OptionDef } from "../catalog/types";
import type { GraphDoc, GraphNode } from "../graph/types";
import { rootSystemOf } from "../graph/ops";
import { formula, nuclearCharge, parseAtoms } from "../chem/xyz";
import { hasValue } from "../rules/analyze";
import { multiplicityName } from "../chem/state";

export interface Shown {
  text: string;
  muted?: boolean;
  missing?: boolean;
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    return v.toExponential().replace(/\.?0+e/, "e").replace("e+", "e");
  }
  return String(v);
}

export function formatValue(v: unknown): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return formatNumber(v);
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  return String(v);
}

export function showOption(node: GraphNode, name: string, opt: OptionDef): Shown {
  const v = node.options[name];
  if (hasValue(v)) {
    if (opt.type === "system_ref") return { text: v ? "from System" : "no" };
    if (opt.type === "text") return { text: firstLine(String(v)) };
    return { text: formatValue(v) };
  }
  if (opt.default !== undefined && opt.default !== null) {
    return { text: formatValue(opt.default), muted: true };
  }
  return { text: opt.required ? "required" : "—", muted: !opt.required, missing: opt.required };
}

function firstLine(s: string): string {
  const line = s.trim().split("\n")[0];
  return line.length > 24 ? `${line.slice(0, 23)}…` : line;
}

export function toSubscript(f: string): string {
  return f.replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
}

export function systemFormula(node: GraphNode): string | undefined {
  const xyz = node.options.xyz;
  if (typeof xyz !== "string") return undefined;
  const atoms = parseAtoms(xyz);
  return atoms ? formula(atoms) : undefined;
}

export function electronsFromSystem(
  doc: GraphDoc,
  catalog: Catalog,
  nodeId: string,
  charge: number,
): number | undefined {
  const sys = rootSystemOf(doc, catalog, nodeId);
  const xyz = sys?.options.xyz;
  if (typeof xyz !== "string") return undefined;
  const atoms = parseAtoms(xyz);
  return atoms ? nuclearCharge(atoms) - charge : undefined;
}

// A one-line description of a value node, for chips inside a card.
export function chipText(doc: GraphDoc, catalog: Catalog, node: GraphNode, def: NodeDef): string {
  const o = node.options;
  if (node.type === "State" || node.type === "RelState") {
    let nel: string = hasValue(o.nel) ? String(o.nel) : "?";
    if (!hasValue(o.nel) && o.system === true) {
      const n = electronsFromSystem(doc, catalog, node.id, Number(o.charge ?? 0));
      nel = n === undefined ? "System" : String(n);
    }
    const parts = [`${nel} e⁻`];
    if (hasValue(o.multiplicity)) {
      parts.push(multiplicityName(Number(o.multiplicity)));
    }
    if (hasValue(o.ms)) parts.push(`Mₛ ${formatValue(o.ms)}`);
    if (Array.isArray(o.gas_max) && o.gas_max.length) parts.push(`GAS max ${o.gas_max.join("/")}`);
    return parts.join(" · ");
  }
  if (node.type === "X2CParams") {
    const type = String(o.x2c_type ?? "?").toUpperCase();
    const model = String(o.x2c_model ?? def.options.x2c_model?.default ?? "");
    const parts = [`${type}-X2C`, model];
    if (hasValue(o.snso_type)) parts.push(String(o.snso_type));
    return parts.filter(Boolean).join(" · ");
  }
  const set = Object.entries(def.options).filter(([k]) => hasValue(o[k]));
  if (set.length === 0) return "defaults";
  return set
    .slice(0, 3)
    .map(([k]) => `${k} ${formatValue(o[k])}`)
    .join(" · ");
}
