import { describe, expect, it } from "vitest";
import { analyze } from "../src/rules/analyze";
import { connectionFixes, suggestFixes } from "../src/rules/fixes";
import type { GraphDoc } from "../src/graph/types";
import { catalog, graph, n2, state } from "./helpers";

// Fix labels for the first error, and the errors left after each fix.
function fixesFor(doc: GraphDoc) {
  const analysis = analyze(doc, catalog);
  const issue = analysis.issues.find((i) => i.severity === "error")!;
  return suggestFixes(doc, catalog, issue, analysis).map((f) => [f.label, f.errors]);
}

const rhf = { id: "rhf", type: "RHF", parent: "system", options: { charge: 0 } };

describe("fix suggestions", () => {
  it("offers three ways to give a two-component solver spinors", () => {
    const doc = graph(n2, rhf, {
      id: "ci",
      type: "CI",
      parent: "rhf",
      slots: { ci_solver: { type: "RelCISolver", options: { nel: 14, active_orbitals: "12" } } },
    });
    expect(fixesFor(doc)).toEqual([
      ["Insert SpinorUpcaster between RHF and CI", 0],
      ["Switch RelCISolver to CISolver", 0],
      ["Switch RHF to GHF", 0],
    ]);
  });

  it("switches the method that breaks a rule", () => {
    const doc = graph(
      { ...n2, slots: { x2c: { type: "X2CParams", options: { x2c_type: "so" } } } },
      rhf,
    );
    expect(fixesFor(doc)).toEqual([["Switch RHF to GHF", 0]]);
  });

  it("switches DSRG to its two-component variant", () => {
    const doc = graph(
      n2,
      { id: "ghf", type: "GHF", parent: "system", options: { charge: 0 } },
      {
        id: "mc",
        type: "MCOptimizer",
        parent: "ghf",
        slots: { ci_solver: { type: "RelCISolver", options: { nel: 14, active_orbitals: "12" } } },
      },
      { id: "dsrg", type: "DSRG_MRPT2", parent: "mc" },
    );
    expect(fixesFor(doc)).toEqual([["Switch DSRG_MRPT2 to RelDSRG_MRPT2", 0]]);
  });

  it("inserts AVAS when nothing upstream defines an active space", () => {
    const doc = graph(n2, rhf, {
      id: "mc",
      type: "MCOptimizer",
      parent: "rhf",
      slots: { ci_solver: { type: "CISolver", slots: { states: state } } },
    });
    expect(fixesFor(doc)).toEqual([["Insert AVAS between RHF and MCOptimizer", 0]]);
  });

  it("connects a loose method to the nodes it can follow", () => {
    const doc = graph(n2, rhf, { id: "rohf", type: "ROHF", options: { charge: 0, ms: 0.0 } });
    expect(fixesFor(doc)).toEqual([["Connect after System", 0]]);
  });

  it("suggests fixes for a connection the canvas refuses", () => {
    const doc = graph(n2, { id: "uhf", type: "UHF", parent: "system", options: { charge: 0, ms: 0.0 } }, {
      id: "avas",
      type: "AVAS",
      options: { subspace: ["N(2p)"] },
    });
    const fixes = connectionFixes(doc, catalog, "uhf", "avas");
    expect(fixes.map((f) => f.label)).toEqual(["Switch UHF to RHF"]);
    expect(fixes[0].doc.nodes.avas.parent).toBe("uhf");
    expect(fixes[0].doc.nodes.uhf.type).toBe("RHF");
  });

  it("requires the failed check to pass, not just to change its wording", () => {
    // Inserting AVAS gives ASET an active space but leaves it after the wrong
    // parent, so only MCOptimizer fixes both problems.
    const doc = graph(n2, rhf, { id: "aset", type: "ASET", parent: "rhf", options: { fragment: ["N1"] } });
    const analysis = analyze(doc, catalog);
    const labels = analysis.issues.map((i) => suggestFixes(doc, catalog, i, analysis).map((f) => f.label));
    expect(labels).toEqual([
      ["Insert MCOptimizer between RHF and ASET"],
      ["Insert MCOptimizer between RHF and ASET"],
    ]);
  });
});
