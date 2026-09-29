import { describe, expect, it } from "vitest";
import { generatePython } from "../src/codegen/python";
import { catalog, graph, messages, n2, state } from "./helpers";

const rhf = { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } };

describe("analysis nodes", () => {
  it("calls post-processing functions after the chain runs", () => {
    const doc = graph(
      n2,
      rhf,
      { id: "dipole", type: "get_1e_property", parent: "rhf", options: { property_name: "dipole" } },
      { id: "charges", type: "mulliken_population", parent: "rhf" },
      { id: "cubes", type: "write_orbital_cubes", parent: "rhf", options: { indices: [5, 6] } },
    );
    expect(messages(doc)).toEqual([]);
    const py = generatePython(doc, catalog);
    expect(py).toContain(
      "from forte2 import (\n    RHF,\n    System,\n    get_1e_property,\n    mulliken_population,\n    write_orbital_cubes,\n)",
    );
    expect(py.slice(py.indexOf("rhf.run()"))).toBe(
      `rhf.run()

dipole = get_1e_property(
    rhf.system, rhf._build_total_density_matrix(), property_name="dipole"
)
print(dipole)
charges = mulliken_population(rhf.system, rhf._build_total_density_matrix())
print(charges)
write_orbital_cubes(rhf.system, rhf.mos.C[0], indices=[5, 6])
`.trimEnd() + "\n",
    );
  });

  it("runs the method an analysis node follows, and the rest of the chain", () => {
    const doc = graph(
      n2,
      rhf,
      { id: "avas", type: "AVAS", parent: "rhf", options: { subspace: ["N(2p)"] } },
      { id: "cubes", type: "write_orbital_cubes", parent: "avas", options: { indices: [5, 6] } },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "avas",
        slots: { ci_solver: { type: "CISolver", slots: { states: state } } },
      },
    );
    const py = generatePython(doc, catalog);
    expect(py).toContain("mc.run()\n\nwrite_orbital_cubes(avas.system, avas.mos.C[0], indices=[5, 6])");
    expect(py).not.toContain("avas.run()");
  });

  it("chains analysis nodes, filling each from the one before", () => {
    const doc = graph(
      n2,
      rhf,
      { id: "iao", type: "IAO", parent: "rhf" },
      { id: "iao_charges", type: "iao_partial_charge", parent: "iao" },
      { id: "ibo", type: "IBO", parent: "rhf" },
      { id: "cubes", type: "write_orbital_cubes", parent: "ibo", options: { indices: [0, 1] } },
      {
        id: "ci",
        type: "CI",
        parent: "rhf",
        slots: { ci_solver: { type: "CISolver", options: { active_orbitals: "[5, 6]" }, slots: { states: state } } },
      },
      { id: "mca", type: "MutualCorrelationAnalysis", parent: "ci" },
    );
    expect(messages(doc)).toEqual([]);
    const py = generatePython(doc, catalog);
    expect(py).toContain(
      "from forte2.orbitals import IAO, IBO\nfrom forte2.props import MutualCorrelationAnalysis, iao_partial_charge",
    );
    expect(py.slice(py.indexOf("ci.run()"))).toBe(
      `ci.run()

iao = IAO(rhf.system, rhf.C[0][:, : rhf.ndocc])
iao_charges = iao_partial_charge(
    iao.system, iao.make_sf_1rdm(rhf._build_total_density_matrix())
)
print(iao_charges)
ibo = IBO(rhf.system, rhf.C[0][:, : rhf.ndocc])
write_orbital_cubes(ibo.system, ibo.C_ibo, indices=[0, 1])
mca = MutualCorrelationAnalysis(ci)
print(mca.mutual_correlation_matrix_summary())
`,
    );
  });

  it("lets only analysis nodes follow an analysis node", () => {
    const doc = graph(n2, rhf, { id: "ibo", type: "IBO", parent: "rhf" }, {
      id: "ci",
      type: "CI",
      parent: "ibo",
      slots: { ci_solver: { type: "CISolver", options: { active_orbitals: "[5, 6]" }, slots: { states: state } } },
    });
    expect(messages(doc)).toEqual(["ci: Only analysis nodes can follow IBO."]);
  });

  it("checks what an analysis node needs from its method", () => {
    const doc = graph(
      n2,
      { id: "ghf", type: "GHF", parent: "system", options: { charge: 0 } },
      { id: "charges", type: "mulliken_population", parent: "ghf" },
      rhf,
      { id: "cubes", type: "write_orbital_cubes", parent: "rhf", options: { format: "2ccube" } },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "rhf",
        slots: { ci_solver: { type: "CISolver", options: { active_orbitals: "6" }, slots: { states: state } } },
      },
      { id: "dipole", type: "get_1e_property", parent: "mc", options: { property_name: "dipole" } },
    );
    expect(messages(doc)).toEqual([
      "charges: mulliken_population needs one-component orbitals, but GHF gives two-component (spinor) orbitals.",
      "dipole: get_1e_property needs an AO density matrix, which MCOptimizer doesn't provide.",
      'cubes: The "2ccube" format needs two-component orbitals.',
    ]);
    expect(messages(doc, "warning")).toEqual([
      "cubes: Without indices, this writes a cube file for every orbital.",
    ]);
  });
});
