import type { Catalog, Electrons } from "../catalog/types";
import type { GraphDoc, GraphNode } from "../graph/types";
import { rootSystemOf, setOption } from "../graph/ops";
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

// Electrons for a mean-field node: the System's nuclear charge minus the
// node's charge. A model Hamiltonian has no nuclei, so there the count is
// minus the charge.
function boundElectrons(node: GraphNode, e: Electrons, system: GraphNode): number | undefined {
  const charge = Number(node.options[e.charge] ?? 0);
  if (!Number.isInteger(charge)) return undefined;
  if (system.type === "HubbardModel") return -charge;
  if (typeof system.options.xyz !== "string") return undefined;
  const atoms = parseAtoms(system.options.xyz);
  return atoms ? nuclearCharge(atoms) - charge : undefined;
}

// The electron-count checks forte2's SCF classes run when they bind to a
// System.
export function electronProblems(
  node: GraphNode,
  e: Electrons,
  system: GraphNode | undefined,
): { field: string; message: string }[] {
  const nel = system ? boundElectrons(node, e, system) : undefined;
  if (nel === undefined) return [];
  if (nel < 0) {
    return [{ field: e.charge, message: `A charge of ${node.options[e.charge]} leaves ${nel} electrons.` }];
  }
  if (e.closed_shell && nel % 2 === 1) {
    return [
      {
        field: e.charge,
        message: `${node.type} needs an even number of electrons, but this System has ${nel}. Use ROHF or UHF, or change the charge.`,
      },
    ];
  }
  const ms = e.ms ? node.options[e.ms] : undefined;
  if (!e.ms || typeof ms !== "number") return [];
  const twice = 2 * ms;
  if (!Number.isInteger(twice)) {
    return [{ field: e.ms, message: `${e.ms} must be a multiple of 0.5.` }];
  }
  if (Math.abs(twice) % 2 !== nel % 2) {
    return [{ field: e.ms, message: `${e.ms} = ${ms} doesn't fit ${nel} electrons.` }];
  }
  if (Math.abs(twice) > nel) {
    return [
      {
        field: e.ms,
        message: `${e.ms} = ${ms} needs at least ${Math.abs(twice)} electrons; this System has ${nel}.`,
      },
    ];
  }
  return [];
}

// A new State defaults to a singlet; make each State that `doc` adds to
// `prev` a doublet when the System has an odd number of electrons.
export function seedNewStates(prev: GraphDoc, doc: GraphDoc, catalog: Catalog): GraphDoc {
  let out = doc;
  for (const n of Object.values(doc.nodes)) {
    if (prev.nodes[n.id] || (n.type !== "State" && n.type !== "RelState")) continue;
    const nel = stateElectrons(n, rootSystemOf(doc, catalog, n.id));
    if (nel !== undefined && nel % 2 === 1 && n.options.multiplicity === 1) {
      out = setOption(setOption(out, n.id, "multiplicity", 2), n.id, "ms", 0.5);
    }
  }
  return out;
}
