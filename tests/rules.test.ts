import { describe, expect, it } from "vitest";
import { attachProblems, analyze } from "../src/rules/analyze";
import { catalog, graph, messages, n2, state } from "./helpers";

describe("rules", () => {
  it("accepts a valid CASSCF chain", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      { id: "avas", type: "AVAS", parent: "rhf", options: { subspace: ["N(2p)"] } },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "avas",
        slots: { ci_solver: { type: "CISolver", slots: { states: state } } },
      },
      { id: "dsrg", type: "DSRG_MRPT2", parent: "mc" },
    );
    expect(messages(doc)).toEqual([]);
    expect(messages(doc, "warning")).toEqual([]);
  });

  it("rejects a two-component solver on one-component orbitals, on the solver", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      {
        id: "ci",
        type: "CI",
        parent: "rhf",
        slots: { ci_solver: { type: "RelCISolver", options: { nel: 14, active_orbitals: "6" } } },
      },
    );
    expect(messages(doc)).toEqual([
      "ci.ci_solver: RelCISolver needs two-component (spinor) orbitals, but RHF gives one-component orbitals.",
    ]);
  });

  it("accepts a two-component solver after SpinorUpcaster", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      { id: "up", type: "SpinorUpcaster", parent: "rhf" },
      {
        id: "ci",
        type: "CI",
        parent: "up",
        slots: { ci_solver: { type: "RelCISolver", options: { nel: 14, active_orbitals: "12" } } },
      },
    );
    expect(messages(doc)).toEqual([]);
  });

  it("requires GHF for spin-orbit X2C", () => {
    const so = {
      ...n2,
      slots: { x2c: { type: "X2CParams", options: { x2c_type: "so" } } },
    };
    expect(messages(graph(so, { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } }))).toEqual([
      "rhf: Spin-orbit X2C needs GHF. Use GHF, or set the System's X2C to x2c_type=\"sf\".",
    ]);
    expect(messages(graph(so, { id: "ghf", type: "GHF", parent: "system", options: { charge: 0 } }))).toEqual([]);
  });

  it("checks parents, provided facts and model systems", () => {
    const doc = graph(
      n2,
      { id: "uhf", type: "UHF", parent: "system", options: { charge: 0 } },
      { id: "avas", type: "AVAS", parent: "uhf", options: { subspace: ["N(2p)"] } },
      { id: "dsrg", type: "DSRG_MRPT2", parent: "uhf" },
      { id: "rohf", type: "ROHF", parent: "system", options: { charge: 0 } },
      { id: "opt", type: "GeometryOptimizer", parent: "rohf" },
    );
    expect(messages(doc)).toEqual([
      "avas: AVAS must follow RHF, ROHF, or GHF, not UHF.",
      "dsrg: DSRG_MRPT2 must follow CI or MCOptimizer, not UHF.",
      "dsrg: DSRG_MRPT2 needs an active space, which UHF doesn't provide.",
      "opt: GeometryOptimizer needs a nuclear gradient, which ROHF doesn't provide.",
    ]);
  });

  it("asks for an active space when nothing upstream defines one", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      { id: "ci", type: "CI", parent: "rhf", slots: { ci_solver: { type: "CISolver", slots: { states: state } } } },
    );
    expect(messages(doc)).toEqual([
      "ci.ci_solver: The upstream method doesn't define an active space. Set active_orbitals (and core_orbitals), or add AVAS upstream.",
    ]);
  });

  it("flags option types, required options and orphans", () => {
    const doc = graph(
      { id: "system", type: "System", options: { xyz: "H 0 0 0\nH 0 0 1", basis_set: "sto-3g" } },
      { id: "rhf", type: "RHF", parent: "system", options: { e_tol: "tight" } },
      { id: "mc", type: "MCOptimizer" },
    );
    expect(messages(doc)).toEqual([
      "mc: Connect MCOptimizer to an upstream method.",
      "system: Set auxiliary_basis_set, or turn on cholesky_tei. forte2 has no conventional four-index integrals.",
      "rhf: Set charge.",
      "rhf: e_tol must be a number.",
      "mc: Add CISolver, SelectedCISolver, RelCISolver, or RelSelectedCISolver to ci_solver.",
    ]);
  });

  it("explains why a node can't follow another", () => {
    const doc = graph(n2, { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } });
    const { facts } = analyze(doc, catalog);
    const why = (type: string) =>
      attachProblems(catalog, doc, type, doc.nodes.rhf, facts.rhf).map((p) => p.message);
    expect(why("AVAS")).toEqual([]);
    expect(why("MCOptimizer")).toEqual([]);
    expect(why("ASET")).toEqual([
      "ASET must follow MCOptimizer, not RHF.",
      "ASET needs an active space, which RHF doesn't provide.",
    ]);
    expect(why("RelDSRG_MRPT2")).toEqual([
      "RelDSRG_MRPT2 must follow CI or MCOptimizer, not RHF.",
      "RelDSRG_MRPT2 needs an active space, which RHF doesn't provide.",
      "RelDSRG_MRPT2 needs two-component (spinor) orbitals, but RHF gives one-component orbitals.",
    ]);
  });

  it("checks a State against the electron count, as forte2 does", () => {
    const withState = (options: Record<string, unknown>) =>
      graph(
        { id: "system", type: "System", options: { xyz: "F 0 0 0", basis_set: "cc-pvdz", auxiliary_basis_set: "cc-pvtz-jkfit" } },
        { id: "rohf", type: "ROHF", parent: "system", options: { charge: 0, ms: 0.5 } },
        {
          id: "ci",
          type: "CI",
          parent: "rohf",
          slots: {
            ci_solver: {
              type: "CISolver",
              options: { active_orbitals: "4" },
              slots: { states: { type: "State", options } },
            },
          },
        },
      );
    expect(messages(withState({ system: true, multiplicity: 2, ms: 0.5 }))).toEqual([]);
    expect(messages(withState({ system: true, multiplicity: 1, ms: 0.0 }))).toEqual([
      "ci.ci_solver.states: 9 electrons can't form a singlet; use multiplicity 2, 4, 6, …",
      "ci.ci_solver.states: Mₛ = 0 doesn't fit 9 electrons.",
    ]);
    expect(messages(withState({ nel: 9, multiplicity: 2, ms: 1.5 }))).toEqual([
      "ci.ci_solver.states: Mₛ = 1.5 is outside a doublet, which allows |Mₛ| ≤ 0.5.",
    ]);
  });
});
