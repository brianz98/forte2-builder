import type {
  Catalog,
  NodeDef,
  OptionDef,
  OptionType,
  Rule,
  Scalar,
  SlotDef,
} from "./types";

export interface DumpOption {
  name: string;
  type: string;
  required: boolean;
  doc: string | null;
  default?: { value?: unknown; repr?: string };
}

export interface DumpClass {
  module: string;
  mro: string[];
  summary: string;
  options: DumpOption[];
}

export interface Dump {
  forte2_version: string;
  classes: Record<string, DumpClass>;
}

type RawOption = Partial<OptionDef>;

interface RawNode {
  extends?: string;
  dump?: string;
  abstract?: boolean;
  kind?: NodeDef["kind"];
  group?: string;
  summary?: string;
  import?: string;
  api?: string;
  var?: string;
  family?: string;
  parents?: string[];
  requires?: string[];
  provides?: string[];
  passes?: string[];
  sets?: Record<string, Scalar>;
  requires_attrs?: Record<string, Scalar>;
  inherit_requirements_from?: string;
  slots?: Record<string, SlotDef>;
  options?: Record<string, RawOption>;
  hide?: string[];
  card?: string[];
  rules?: Rule[];
  tags?: string[];
}

export interface RawCatalog {
  forte2_version: string;
  docs_base: string;
  groups: Catalog["groups"];
  facts?: Catalog["facts"];
  attrs?: Catalog["attrs"];
  nodes: Record<string, RawNode>;
}

export interface LoadResult {
  catalog: Catalog;
  problems: string[];
}

// Map a Python annotation from the dump onto a form control type.
export function inferType(pyType: string): Pick<OptionDef, "type" | "values"> {
  const t = pyType.replace(/\s+/g, " ").trim();
  const literal = /^Literal\[(.*)\]$/.exec(t);
  if (literal) {
    const values = literal[1].split(",").map((v) => parseLiteral(v.trim()));
    return { type: "enum", values };
  }
  const parts = t
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p !== "None");
  const base = parts.length === 1 ? parts[0] : parts.join(" | ");
  const direct: Record<string, OptionType> = {
    bool: "bool",
    int: "int",
    float: "float",
    str: "str",
    "str | dict": "str",
    "list[int]": "list[int]",
    "list[float]": "list[float]",
    "list[str]": "list[str]",
  };
  return { type: direct[base] ?? "py" };
}

function parseLiteral(token: string): Scalar {
  if (token === "None") return null;
  if (token === "True") return true;
  if (token === "False") return false;
  const quoted = /^['"](.*)['"]$/.exec(token);
  if (quoted) return quoted[1];
  const n = Number(token);
  return Number.isNaN(n) ? token : n;
}

function mergeRaw(base: RawNode, own: RawNode): RawNode {
  return {
    ...base,
    ...own,
    abstract: own.abstract ?? false,
    options: { ...(base.options ?? {}), ...(own.options ?? {}) },
    slots: { ...(base.slots ?? {}), ...(own.slots ?? {}) },
    rules: [...(base.rules ?? []), ...(own.rules ?? [])],
    hide: [...(base.hide ?? []), ...(own.hide ?? [])],
    sets: { ...(base.sets ?? {}), ...(own.sets ?? {}) },
    requires_attrs: { ...(base.requires_attrs ?? {}), ...(own.requires_attrs ?? {}) },
  };
}

function resolveExtends(
  name: string,
  raw: Record<string, RawNode>,
  seen: Set<string> = new Set(),
): RawNode {
  const own = raw[name];
  if (!own.extends) return own;
  if (seen.has(name)) throw new Error(`Catalog: circular extends at ${name}`);
  seen.add(name);
  const base = raw[own.extends];
  if (!base) throw new Error(`Catalog: ${name} extends unknown ${own.extends}`);
  return mergeRaw(resolveExtends(own.extends, raw, seen), own);
}

function apiUrl(docsBase: string, module: string, name: string): string {
  return `${docsBase}${module.split(".").join("/")}/index.html#${module}.${name}`;
}

export function loadCatalog(raw: RawCatalog, dump: Dump | undefined): LoadResult {
  const problems: string[] = [];
  const nodes: Record<string, NodeDef> = {};

  for (const name of Object.keys(raw.nodes)) {
    const r = resolveExtends(name, raw.nodes);
    if (r.abstract) continue;
    const dumpName = r.dump ?? name;
    const dc = dump?.classes[dumpName];
    if (dump && !dc) problems.push(`${name}: class ${dumpName} is not in the forte2 dump`);
    const dumpOpts = new Map((dc?.options ?? []).map((o) => [o.name, o]));
    const slots: Record<string, SlotDef> = {};
    for (const [sname, s] of Object.entries(r.slots ?? {})) {
      const d = dumpOpts.get(sname);
      if (dump && dc && !d) problems.push(`${name}.${sname}: slot is not a constructor argument`);
      slots[sname] = { ...s, doc: s.doc ?? d?.doc ?? undefined };
    }

    const options: Record<string, OptionDef> = {};
    for (const [oname, o] of Object.entries(r.options ?? {})) {
      const d = dumpOpts.get(oname);
      if (dump && dc && !d) problems.push(`${name}.${oname}: option is not a constructor argument`);
      options[oname] = fillOption(o, d);
    }
    const hide = new Set(r.hide ?? []);
    for (const d of dc?.options ?? []) {
      if (d.name in options || d.name in slots) continue;
      options[d.name] = {
        ...fillOption({}, d),
        advanced: true,
        hidden: hide.has(d.name),
        uncurated: true,
      };
    }

    if (!r.kind || !r.group || !r.import) {
      problems.push(`${name}: kind, group and import are required`);
    }
    nodes[name] = {
      name,
      kind: r.kind ?? "method",
      group: r.group ?? "misc",
      summary: r.summary ?? dc?.summary ?? "",
      import: r.import ?? "forte2",
      api: r.api ?? (dc ? apiUrl(raw.docs_base, dc.module, dumpName) : undefined),
      var: r.var,
      family: r.family,
      parents: r.parents,
      requires: r.requires ?? [],
      provides: r.provides ?? [],
      passes: r.passes ?? [],
      sets: r.sets ?? {},
      requires_attrs: r.requires_attrs ?? {},
      inherit_requirements_from: r.inherit_requirements_from,
      slots,
      options,
      card: r.card,
      rules: r.rules ?? [],
      tags: r.tags,
    };
  }

  const catalog: Catalog = {
    forte2_version: raw.forte2_version,
    docs_base: raw.docs_base,
    groups: raw.groups,
    facts: raw.facts ?? {},
    attrs: raw.attrs ?? {},
    nodes,
  };
  problems.push(...checkReferences(catalog));
  if (dump && dump.forte2_version !== raw.forte2_version) {
    problems.push(
      `catalog is for forte2 ${raw.forte2_version} but the dump is from ${dump.forte2_version}`,
    );
  }
  return { catalog, problems };
}

function fillOption(o: RawOption, d: DumpOption | undefined): OptionDef {
  const inferred = d ? inferType(d.type) : { type: "py" as OptionType };
  const def: OptionDef = {
    ...inferred,
    ...o,
    type: o.type ?? inferred.type,
    doc: o.doc ?? d?.doc ?? undefined,
    required: o.required ?? d?.required ?? false,
  };
  if (!("default" in o) && d?.default) {
    if ("value" in d.default) def.default = d.default.value;
    else def.defaultRepr = d.default.repr;
  }
  if (def.type === "enum" && !def.values) def.values = [];
  return def;
}

function checkReferences(c: Catalog): string[] {
  const out: string[] = [];
  for (const n of Object.values(c.nodes)) {
    if (!c.groups[n.group]) out.push(`${n.name}: unknown group ${n.group}`);
    for (const p of n.parents ?? []) {
      if (!c.nodes[p]) out.push(`${n.name}: unknown parent ${p}`);
    }
    for (const [sname, s] of Object.entries(n.slots)) {
      for (const a of s.accepts) {
        if (!c.nodes[a]) out.push(`${n.name}.${sname}: unknown type ${a}`);
      }
    }
    if (n.inherit_requirements_from && !n.slots[n.inherit_requirements_from]) {
      out.push(`${n.name}: inherit_requirements_from names no slot`);
    }
    for (const card of n.card ?? []) {
      if (!n.options[card] && !n.slots[card]) out.push(`${n.name}: card lists unknown ${card}`);
    }
    for (const [oname, o] of Object.entries(n.options)) {
      if (o.type === "enum" && (!o.values || o.values.length === 0)) {
        out.push(`${n.name}.${oname}: enum has no values`);
      }
    }
  }
  return out;
}
