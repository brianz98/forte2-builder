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
      { id: "uhf", type: "UHF", parent: "system", options: { charge: 0, ms: 0.0 } },
      { id: "avas", type: "AVAS", parent: "uhf", options: { subspace: ["N(2p)"] } },
      { id: "dsrg", type: "DSRG_MRPT2", parent: "uhf" },
      { id: "rohf", type: "ROHF", parent: "system", options: { charge: 0, ms: 0.0 } },
      { id: "opt", type: "GeometryOptimizer", parent: "rohf" },
    );
    expect(messages(doc)).toEqual([
      "avas: AVAS must follow RHF, ROHF, or GHF, not UHF.",
      "dsrg: DSRG_MRPT2 must follow CI or MCOptimizer, not UHF.",
      "dsrg: DSRG_MRPT2 needs an active space, which UHF doesn't provide.",
      "opt: GeometryOptimizer needs a nuclear gradient, which ROHF doesn't provide.",
    ]);
  });

  it("checks the electron count of each SCF, as forte2 does on binding", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 1 } },
      { id: "uhf", type: "UHF", parent: "system", options: { charge: 0, ms: 0.5 } },
      { id: "rohf", type: "ROHF", parent: "system", options: { charge: 0 } },
      { id: "cuhf", type: "CUHF", parent: "system", options: { charge: -1, ms: 0.5 } },
      { id: "ghf", type: "GHF", parent: "system", options: { charge: 0, ms_guess: 0.5 } },
    );
    expect(messages(doc)).toEqual([
      "rhf: RHF needs an even number of electrons, but this System has 13. Use ROHF or UHF, or change the charge.",
      "uhf: ms = 0.5 doesn't fit 14 electrons.",
      "rohf: Set ms.",
      "ghf: ms_guess = 0.5 doesn't fit 14 electrons.",
    ]);
  });

  it("checks what DSRG, solvers, drivers and gradients need beyond the chain facts", () => {
    const solver = (type: string, extra: Record<string, unknown> = {}) => ({
      type,
      options: { active_orbitals: "[4, 5, 6, 7, 8, 9]", core_orbitals: "[0, 1, 2, 3]", ...extra },
      slots: { states: state },
    });
    const doc = graph(
      { ...n2, options: { ...n2.options, symmetry: true } },
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      { id: "sci", type: "CI", parent: "rhf", slots: { ci_solver: solver("SelectedCISolver") } },
      { id: "dsrg", type: "DSRG_MRPT2", parent: "sci" },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "rhf",
        options: { active_frozen_orbitals: [4] },
        slots: { ci_solver: solver("CISolver", { frozen_core_orbitals: "[0]" }) },
      },
      { id: "opt", type: "GeometryOptimizer", parent: "mc", options: { root: 1 } },
      { id: "fd", type: "FDGradient", parent: "rhf", options: { root: 1 } },
    );
    expect(messages(doc)).toEqual([
      "dsrg: DSRG_MRPT2 needs a solver that computes 3-RDMs, but CI gives a solver without 3-RDMs (selected CI).",
      "opt: Geometry optimization moves the atoms, which forte2 can't do with symmetry=True, because symmetry detection reorients the molecule. Turn off symmetry on the System.",
      'opt: Gradients of one root of a state-averaged MCOptimizer need its final_orbitals to be "original".',
      "opt: forte2 has no CASSCF gradients with active_frozen_orbitals or freeze_inter_gas_rots. Clear them, or put FDGradient before GeometryOptimizer.",
      "opt: forte2 has no CASSCF gradients with frozen orbitals. Clear the solver's frozen orbitals, or put FDGradient before GeometryOptimizer.",
      "fd: Finite differences move the atoms, which forte2 can't do with symmetry=True, because symmetry detection reorients the molecule. Turn off symmetry on the System.",
      "fd: Every method in the builder reports one energy, so root can only be 0. forte2 picks another root through energy_accessor, which the builder doesn't offer.",
    ]);

    const rel = graph(
      { ...n2, options: { ...n2.options, cholesky_tei: true, auxiliary_basis_set: undefined } },
      { id: "ghf", type: "GHF", parent: "system", options: { charge: 0 } },
      { id: "opt", type: "GeometryOptimizer", parent: "ghf", options: { root: 0 } },
      {
        id: "ci",
        type: "CI",
        parent: "ghf",
        options: { do_transition_dipole: true },
        slots: {
          ci_solver: {
            type: "RelCISolver",
            options: { nel: 14, active_orbitals: "12" },
            slots: { ci_params: { type: "CIParams", options: { ci_algorithm: "kh" } } },
          },
        },
      },
    );
    expect(messages(rel)).toEqual([
      "opt: root picks one state of a state-averaged MCOptimizer. Clear root, or follow an MCOptimizer.",
      "opt: Analytic gradients need density fitting, not cholesky_tei. Turn off cholesky_tei, or put FDGradient before GeometryOptimizer.",
      "opt: Analytic gradients need the System's auxiliary_basis_set.",
      'ci.ci_solver: The Knowles–Handy CI algorithm is for one-component solvers only. Use "hz", "exact", or "sparse".',
    ]);
    expect(messages(rel, "warning")).toEqual([
      "ci: Two-component solvers don't compute transition densities between roots, so forte2 reports only each root's own dipole.",
    ]);
  });

  it("reports a disconnected method once, not again on everything below it", () => {
    const doc = graph(
      n2,
      { id: "avas", type: "AVAS", options: { subspace: ["N(2p)"] } },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "avas",
        slots: { ci_solver: { type: "CISolver", slots: { states: state } } },
      },
    );
    expect(messages(doc)).toEqual(["avas: Connect AVAS to an upstream method."]);
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
