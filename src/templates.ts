import type { GraphFile } from "./graph/types";

const files = import.meta.glob<GraphFile>("../templates/*.yaml", {
  eager: true,
  import: "default",
});

export interface Template {
  id: string;
  file: GraphFile;
}

export const templates: Template[] = Object.entries(files)
  .map(([path, file]) => ({ id: path.replace(/^.*\/(.+)\.yaml$/, "$1"), file }))
  .sort((a, b) => (a.file.order ?? 99) - (b.file.order ?? 99));
