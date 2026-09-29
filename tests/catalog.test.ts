import { describe, expect, it } from "vitest";
import { catalogVersions, getCatalog } from "../src/catalog";
import { inferType } from "../src/catalog/load";

describe("catalog", () => {
  it("loads every version without problems", () => {
    expect(catalogVersions.length).toBeGreaterThan(0);
    for (const v of catalogVersions) {
      expect(getCatalog(v).problems).toEqual([]);
    }
  });

  it("fills options from the dump and keeps curation", () => {
    const { catalog } = getCatalog();
    const rhf = catalog.nodes.RHF;
    expect(rhf.options.charge.required).toBe(true);
    expect(rhf.options.e_tol.default).toBe(1e-9);
    expect(rhf.options.e_tol.doc).toMatch(/convergence/i);
    expect(rhf.options.guess_type).toMatchObject({ type: "enum", values: ["minao", "hcore"] });
    // Uncurated constructor arguments are exposed as advanced options.
    expect(catalog.nodes.System.options.integral_backend).toMatchObject({
      type: "enum",
      advanced: true,
      uncurated: true,
    });
    expect(catalog.nodes.CISolver.options.log_level.hidden).toBe(true);
    expect(catalog.nodes.RHF.api).toBe(
      "https://forte2.readthedocs.io/en/latest/autoapi/forte2/scf/rhf/index.html#forte2.scf.rhf.RHF",
    );
  });

  it("infers form types from Python annotations", () => {
    expect(inferType("float | None")).toEqual({ type: "float" });
    expect(inferType("Literal[None, 'sf', 'so']")).toEqual({ type: "enum", values: [null, "sf", "so"] });
    expect(inferType("int | list[int]")).toEqual({ type: "py" });
    // numpydoc types, used for functions without annotations
    expect(inferType('str, optional, default="orbital"')).toEqual({ type: "str" });
    expect(inferType("List[int], optional, default=None")).toEqual({ type: "list[int]" });
    expect(inferType("float or None")).toEqual({ type: "float" });
  });
});
