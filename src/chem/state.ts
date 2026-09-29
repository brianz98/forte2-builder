import type { GraphNode } from "../graph/types";
import { nuclearCharge, parseAtoms } from "./xyz";

const NAMES = ["singlet", "doublet", "triplet", "quartet", "quintet", "sextet", "septet"];

export function multiplicityName(m: number): string {
  return NAMES[m - 1] ?? `multiplicity ${m}`;
}

// Electrons in a State: its nel, or the System's nuclear charge minus the
// State's charge when it takes the count from the System.
export function stateElectrons(state: GraphNode, system: GraphNode | undefined): number | undefined {
  const o = state.options;
  if (typeof o.nel === "number") return o.nel;
  if (o.system !== true || typeof system?.options.xyz !== "string") return undefined;
  const atoms = parseAtoms(system.options.xyz);
  return atoms ? nuclearCharge(atoms) - Number(o.charge ?? 0) : undefined;
}

// The same consistency checks forte2's State runs on construction.
export function stateProblems(
  state: GraphNode,
  system: GraphNode | undefined,
): { field: string; message: string }[] {
  const nel = stateElectrons(state, system);
  if (nel === undefined || !Number.isInteger(nel)) return [];
  const out: { field: string; message: string }[] = [];
  const mult = state.options.multiplicity;
  const ms = state.options.ms;
  const allowed = nel % 2 === 0 ? "1, 3, 5, …" : "2, 4, 6, …";
  if (typeof mult === "number") {
    if (mult > nel + 1) {
      out.push({ field: "multiplicity", message: `${nel} electrons can't form a ${multiplicityName(mult)}.` });
    } else if ((mult - 1) % 2 !== nel % 2) {
      out.push({
        field: "multiplicity",
        message: `${nel} electrons can't form a ${multiplicityName(mult)}; use multiplicity ${allowed}`,
      });
    }
  }
  if (typeof ms === "number") {
    const twice = Math.round(2 * ms);
    if (Math.abs(twice) % 2 !== nel % 2) {
      out.push({ field: "ms", message: `Mₛ = ${ms} doesn't fit ${nel} electrons.` });
    } else if (typeof mult === "number" && Math.abs(twice) > mult - 1) {
      out.push({
        field: "ms",
        message: `Mₛ = ${ms} is outside a ${multiplicityName(mult)}, which allows |Mₛ| ≤ ${(mult - 1) / 2}.`,
      });
    }
  }
  return out;
}
