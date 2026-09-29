import { loadCatalog, type Dump, type LoadResult, type RawCatalog } from "./load";

const curated = import.meta.glob<RawCatalog>("../../catalog/forte2-*.yaml", {
  eager: true,
  import: "default",
});
const dumps = import.meta.glob<Dump>("../../catalog/forte2-*.dump.json", {
  eager: true,
  import: "default",
});

function versionOf(path: string): string {
  return /forte2-([^/]+?)(?:\.dump)?\.(?:yaml|json)$/.exec(path)?.[1] ?? path;
}

const byVersion = new Map<string, LoadResult>();
for (const [path, raw] of Object.entries(curated)) {
  const version = versionOf(path);
  const dumpPath = Object.keys(dumps).find((p) => versionOf(p) === version);
  byVersion.set(version, loadCatalog(raw, dumpPath ? dumps[dumpPath] : undefined));
}

export const catalogVersions = [...byVersion.keys()].sort().reverse();

export function getCatalog(version: string = catalogVersions[0]): LoadResult {
  const result = byVersion.get(version);
  if (!result) throw new Error(`No catalog for forte2 ${version}`);
  return result;
}
