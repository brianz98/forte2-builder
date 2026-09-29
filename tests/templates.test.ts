import { describe, expect, it } from "vitest";
import { templates } from "../src/templates";
import { parseGraphFile, serializeGraph } from "../src/graph/io";
import { generatePython } from "../src/codegen/python";
import { analyze } from "../src/rules/analyze";
import { catalog } from "./helpers";

describe("templates", () => {
  it.each(templates.map((t) => [t.id, t]))("%s is valid and round-trips", (_, t) => {
    const doc = parseGraphFile(t.file);
    const { issues } = analyze(doc, catalog);
    expect(issues).toEqual([]);
    expect(t.file.forte2_version).toBe(catalog.forte2_version);
    // Unquoted commas in YAML flow mappings silently split a label.
    for (const r of t.file.results ?? []) {
      expect(Object.keys(r).sort()).toEqual(["label", "value"]);
      expect(typeof r.label).toBe("string");
      expect(typeof r.value).toBe("string");
    }
    const again = parseGraphFile(serializeGraph(doc));
    expect(generatePython(again, catalog)).toBe(generatePython(doc, catalog));
  });
});
