// Writes every template as a Python script to build/templates-py/ so
// tools/run_templates.py can run them against an installed forte2.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { generatePython, scriptHeader } from "../src/codegen/python";
import { parseGraphFile } from "../src/graph/io";
import { templates } from "../src/templates";
import { catalog } from "./helpers";

it("renders templates to build/templates-py", () => {
  const dir = join(process.cwd(), "build", "templates-py");
  mkdirSync(dir, { recursive: true });
  for (const t of templates) {
    const header = scriptHeader(catalog, `Template: ${t.file.title}`);
    writeFileSync(join(dir, `${t.id}.py`), generatePython(parseGraphFile(t.file), catalog, { header }));
  }
});
