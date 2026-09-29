import { describe, expect, it } from "vitest";
import { generatePython } from "../src/codegen/python";
import { parseGraphFile } from "../src/graph/io";
import { templates } from "../src/templates";
import { catalog, graph, n2 } from "./helpers";

describe("python codegen", () => {
  it("writes the spin-orbit template the way the forte2 test does", () => {
    const t = templates.find((x) => x.id === "spin-orbit-fluorine")!;
    expect(generatePython(parseGraphFile(t.file), catalog)).toBe(
      `from forte2 import (
    AVAS,
    CI,
    CISolver,
    MCOptimizer,
    ROHF,
    RelCISolver,
    SpinorUpcaster,
    State,
    System,
    X2CParams,
)

xyz = """
F 0 0 0
"""
system = System(
    xyz=xyz,
    basis_set="decon-cc-pVTZ",
    auxiliary_basis_set="cc-pVQZ-JKFIT",
    x2c=X2CParams(x2c_type="sf"),
)

rohf = ROHF(charge=0, ms=0.5)(system)
avas = AVAS(
    subspace=["F(2s)", "F(2p)"], selection_method="separate", num_active_docc=3
)(rohf)
ci_solver = CISolver(nroots=3, states=State(nel=9, multiplicity=2, ms=0.5))
mc = MCOptimizer(ci_solver)(avas)
upcaster = SpinorUpcaster(
    x2c_override=X2CParams(x2c_type="so", snso_type="row-dependent")
)(mc)
ci_solver_2 = RelCISolver(nroots=6, core_orbitals=2, active_orbitals=8, nel=9)
ci = CI(ci_solver_2)(upcaster)

ci.run()
`,
    );
  });

  it("takes the electron count from the System when nel is unset", () => {
    const doc = graph(
      n2,
      { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } },
      {
        id: "ci",
        type: "CI",
        parent: "rhf",
        slots: {
          ci_solver: {
            type: "CISolver",
            options: { active_orbitals: "6", core_orbitals: "4" },
            slots: { states: { type: "State", options: { system: true, multiplicity: 1, ms: 0 } } },
          },
        },
      },
    );
    const py = generatePython(doc, catalog);
    expect(py).toContain("State(system=system, multiplicity=1, ms=0.0)");
    expect(py).toContain("ci = CI(ci_solver)(rhf)");
  });

  it("lists nodes that don't reach a System instead of emitting them", () => {
    const doc = graph(n2, { id: "mc", type: "MCOptimizer" });
    expect(generatePython(doc, catalog)).toContain(
      "# Not generated, because they don't connect to a System: MCOptimizer (mc).",
    );
  });
});
