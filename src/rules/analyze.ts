import type { Catalog, Condition, NodeDef, OptionDef, Rule, Scalar } from "../catalog/types";
import type { GraphDoc, GraphNode } from "../graph/types";
import { chainNodeOf, chainOrder } from "../graph/ops";
import { electronProblems, stateProblems } from "../chem/state";

export type Severity = "error" | "warning";

export interface Issue {
  nodeId: string;
  field?: string;
  severity: Severity;
  message: string;
  // Identifies the check that failed, independent of the wording, for
  // example "parents", "requires:mo_space" or "option:charge".
  code: string;
  // True for problems with how the node attaches to its upstream method.
  connection?: boolean;
}

// What a chain node offers to the nodes that follow it.
export interface Facts {
  id: string;
  type: string;
  provides: Set<string>;
  attrs: Record<string, Scalar>;
  systemId?: string;
}

export interface Analysis {
  facts: Record<string, Facts>;
  issues: Issue[];
  byNode: Record<string, Issue[]>;
  errors: number;
  warnings: number;
}

export function isSet(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Set) return v.size > 0;
  return true;
}

export function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

export function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

function attrLabel(catalog: Catalog, key: string, value: Scalar | undefined): string {
  return catalog.attrs[key]?.[String(value)] ?? `${key} = ${String(value)}`;
}

function factLabel(catalog: Catalog, fact: string): string {
  return catalog.facts[fact]?.label ?? fact;
}

// `delegated` holds the attributes set by the object the node delegates to.
export function deriveFacts(
  def: NodeDef,
  id: string,
  parent?: Facts,
  delegated: Record<string, Scalar> = {},
): Facts {
  const provides = new Set(def.provides ?? []);
  for (const p of def.passes ?? []) if (parent?.provides.has(p)) provides.add(p);
  return {
    id,
    type: def.name,
    provides,
    attrs: { ...(parent?.attrs ?? {}), ...(def.sets ?? {}), ...delegated },
    systemId: def.kind === "system" ? id : parent?.systemId,
  };
}

// The attributes set by the objects in a node's delegates_to slot.
function delegatedSets(catalog: Catalog, doc: GraphDoc, node: GraphNode, def: NodeDef): Record<string, Scalar> {
  if (!def.delegates_to) return {};
  const out: Record<string, Scalar> = {};
  for (const cid of node.slots[def.delegates_to] ?? []) {
    Object.assign(out, catalog.nodes[doc.nodes[cid]?.type]?.sets ?? {});
  }
  return out;
}

interface AttachProblem {
  message: string;
  code: string;
  // The node the problem belongs to, when it isn't the child itself (a solver
  // whose requirements a driver inherits).
  nodeId?: string;
}

// Why `childType` can't follow `parent`. Empty when it can. With `child`, also
// checks requirements inherited from the child's slot contents.
export function attachProblems(
  catalog: Catalog,
  doc: GraphDoc,
  childType: string,
  parent: GraphNode,
  parentFacts: Facts,
  child?: GraphNode,
): AttachProblem[] {
  const def = catalog.nodes[childType];
  const pdef = catalog.nodes[parent.type];
  const out: AttachProblem[] = [];
  if (!def) return [{ code: "unknown", message: `${childType} isn't in this forte2 catalog.` }];
  if (def.kind === "system") {
    return [{ code: "kind", message: `${childType} starts a chain; it can't follow another node.` }];
  }
  if (def.kind === "solver" || def.kind === "value") {
    return [{ code: "kind", message: `${childType} goes inside another node, not after it.` }];
  }
  if (pdef?.kind === "analysis" && def.kind !== "analysis") {
    return [{ code: "kind", message: `Only analysis nodes can follow ${parent.type}.` }];
  }
  if (def.parents && !def.parents.includes(parent.type)) {
    out.push({
      code: "parents",
      message: `${childType} must follow ${joinOr(def.parents)}, not ${parent.type}.`,
    });
  }
  for (const fact of def.requires ?? []) {
    if (!parentFacts.provides.has(fact)) {
      out.push({
        code: `requires:${fact}`,
        message: `${childType} needs ${factLabel(catalog, fact)}, which ${parent.type} doesn't provide.`,
      });
    }
  }
  const checkAttrs = (who: string, need: Record<string, Scalar>, nodeId?: string) => {
    for (const [k, v] of Object.entries(need)) {
      const have = parentFacts.attrs[k];
      // Unknown when the upstream chain isn't connected to a System; that is
      // reported on its own.
      if (have === undefined) continue;
      if (have !== v) {
        out.push({
          nodeId,
          code: `attrs:${k}`,
          message: `${who} needs ${attrLabel(catalog, k, v)}, but ${parent.type} gives ${attrLabel(catalog, k, have)}.`,
        });
      }
    }
  };
  checkAttrs(childType, def.requires_attrs ?? {});
  if (child && def.delegates_to) {
    for (const cid of child.slots[def.delegates_to] ?? []) {
      const c = doc.nodes[cid];
      const cdef = catalog.nodes[c.type];
      if (cdef) checkAttrs(c.type, cdef.requires_attrs ?? {}, cid);
    }
  }
  if (!child) {
    // For a node that doesn't exist yet, apply the rules that only look upstream.
    const ctx: RuleContext = {
      catalog,
      doc,
      node: { id: "", type: childType, options: {}, slots: {} },
      def,
      parent,
      parentFacts,
      system: parentFacts.systemId ? doc.nodes[parentFacts.systemId] : undefined,
    };
    for (const rule of def.rules) {
      if ((rule.severity ?? "error") !== "error" || ruleReferencesSelf(rule)) continue;
      if (!ruleHolds(rule, ctx)) out.push({ code: `rule:${rule.message}`, message: rule.message });
    }
  }
  if (pdef && (pdef.provides ?? []).length === 0 && out.length === 0) {
    out.push({ code: "terminal", message: `Nothing can follow ${parent.type}.` });
  }
  return out;
}

interface RuleContext {
  catalog: Catalog;
  doc: GraphDoc;
  node: GraphNode;
  def: NodeDef;
  parent?: GraphNode;
  parentFacts?: Facts;
  system?: GraphNode;
}

function effective(catalog: Catalog, node: GraphNode, key: string): unknown {
  const def = catalog.nodes[node.type];
  if (def?.slots[key]) return node.slots[key] ?? [];
  if (key in node.options) return node.options[key];
  return def?.options[key]?.default;
}

// "<name>" is the node's type, option or slot; "<slot>.<name>" is the type or
// an option of the first object in that slot.
function nodeValue(ctx: RuleContext, node: GraphNode | undefined, rest: string[]): unknown {
  if (!node) return undefined;
  if (rest.length === 1) return rest[0] === "type" ? node.type : effective(ctx.catalog, node, rest[0]);
  const first = node.slots[rest[0]]?.[0];
  const child = first ? ctx.doc.nodes[first] : undefined;
  if (!child) return undefined;
  return rest[1] === "type" ? child.type : effective(ctx.catalog, child, rest[1]);
}

function resolvePath(path: string, ctx: RuleContext): unknown {
  const [scope, ...rest] = path.split(".");
  if (scope === "self") return nodeValue(ctx, ctx.node, rest);
  if (scope === "parent") {
    if (rest[0] === "provides") return ctx.parentFacts?.provides ?? new Set();
    // Attributes flow down the chain, so read them from the facts.
    if (rest[0] in ctx.catalog.attrs) return ctx.parentFacts?.attrs[rest[0]];
    return nodeValue(ctx, ctx.parent, rest);
  }
  if (scope === "system") return nodeValue(ctx, ctx.system, rest);
  throw new Error(`Unknown rule path ${path}`);
}

function holds(value: unknown, cond: Condition, ctx: RuleContext): boolean {
  const eq = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  const bound = (b: number | string) => (typeof b === "number" ? b : resolvePath(b, ctx));
  if (cond === null || typeof cond !== "object") return eq(value, cond);
  if ("not" in cond) {
    return Array.isArray(cond.not) ? !cond.not.some((c) => eq(value, c)) : !eq(value, cond.not);
  }
  if ("in" in cond) return cond.in.some((c) => eq(value, c));
  if ("set" in cond) return isSet(value) === cond.set;
  if ("has" in cond) return value instanceof Set ? value.has(cond.has) : false;
  if ("lacks" in cond) return value instanceof Set ? !value.has(cond.lacks) : true;
  if ("gt" in cond || "lt" in cond) {
    const b = bound("gt" in cond ? cond.gt : cond.lt);
    if (typeof value !== "number") return false;
    // Another option that isn't a number yet leaves nothing to compare.
    if (typeof b !== "number") return true;
    return "gt" in cond ? value > b : value < b;
  }
  if ("range" in cond) {
    return typeof value === "number" && value >= cond.range[0] && value <= cond.range[1];
  }
  return false;
}

function ruleReferencesSelf(rule: Rule): boolean {
  const paths = [
    ...Object.keys(rule.when ?? {}),
    ...Object.keys(rule.require ?? {}),
    ...(rule.require_any ?? []),
    ...(rule.require_one ?? []),
  ];
  return paths.some((p) => p.startsWith("self."));
}

function ruleHolds(rule: Rule, ctx: RuleContext): boolean {
  const all = (conds: Record<string, Condition>) =>
    Object.entries(conds).every(([path, c]) => holds(resolvePath(path, ctx), c, ctx));
  if (rule.when && !all(rule.when)) return true;
  if (rule.require && !all(rule.require)) return false;
  if (rule.require_any && !rule.require_any.some((p) => isSet(resolvePath(p, ctx)))) return false;
  if (rule.require_one) {
    const n = rule.require_one.filter((p) => isSet(resolvePath(p, ctx))).length;
    if (n !== 1) return false;
  }
  return true;
}

export function optionProblem(name: string, opt: OptionDef, v: unknown): string | undefined {
  const isInt = (x: unknown) => typeof x === "number" && Number.isInteger(x);
  const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  switch (opt.type) {
    case "int":
      return isInt(v) ? undefined : `${name} must be an integer.`;
    case "float":
      return isNum(v) ? undefined : `${name} must be a number.`;
    case "bool":
    case "system_ref":
      return typeof v === "boolean" ? undefined : `${name} must be true or false.`;
    case "str":
    case "text":
    case "py":
      return typeof v === "string" ? undefined : `${name} must be text.`;
    case "enum":
      return (opt.values ?? []).some((x) => x === v)
        ? undefined
        : `${name} must be one of ${joinOr((opt.values ?? []).map((x) => JSON.stringify(x)))}.`;
    case "list[int]":
      return Array.isArray(v) && v.every(isInt) ? undefined : `${name} must be a list of integers.`;
    case "list[float]":
      return Array.isArray(v) && v.every(isNum) ? undefined : `${name} must be a list of numbers.`;
    case "list[str]":
      return Array.isArray(v) && v.every((x) => typeof x === "string")
        ? undefined
        : `${name} must be a list of strings.`;
  }
}

export function analyze(doc: GraphDoc, catalog: Catalog): Analysis {
  const facts: Record<string, Facts> = {};
  const issues: Issue[] = [];
  const add = (
    nodeId: string,
    code: string,
    message: string,
    severity: Severity = "error",
    field?: string,
    connection?: boolean,
  ) =>
    issues.push({ nodeId, code, message, severity, field, ...(connection ? { connection } : {}) });

  for (const id of chainOrder(doc)) {
    const node = doc.nodes[id];
    const def = catalog.nodes[node.type];
    if (!def) {
      add(id, "unknown", `${node.type} isn't in the forte2 ${catalog.forte2_version} catalog.`);
      continue;
    }
    if (def.kind === "solver" || def.kind === "value") {
      const owners = Object.values(catalog.nodes)
        .filter((d) => Object.values(d.slots).some((s) => s.accepts.includes(node.type)))
        .map((d) => d.name);
      add(id, "orphan", `Place ${node.type} inside ${joinOr(owners)}.`);
      continue;
    }
    const parent = node.parent ? doc.nodes[node.parent] : undefined;
    const pf = parent ? facts[parent.id] : undefined;
    if (def.kind !== "system") {
      if (!parent) {
        add(id, "connect", `Connect ${node.type} to an upstream method.`, "error", undefined, true);
      } else if (pf) {
        for (const p of attachProblems(catalog, doc, node.type, parent, pf, node)) {
          add(p.nodeId ?? id, p.code, p.message, "error", undefined, true);
        }
      }
    }
    facts[id] = deriveFacts(def, id, pf, delegatedSets(catalog, doc, node, def));
  }

  for (const node of Object.values(doc.nodes)) {
    const def = catalog.nodes[node.type];
    if (!def) continue;
    const chain = chainNodeOf(doc, node.id);
    const parent = chain.parent ? doc.nodes[chain.parent] : undefined;
    const parentFacts = parent ? facts[parent.id] : undefined;
    const systemId = facts[chain.id]?.systemId;
    const ctx: RuleContext = {
      catalog,
      doc,
      node,
      def,
      parent,
      parentFacts,
      system: systemId ? doc.nodes[systemId] : undefined,
    };

    for (const [name, opt] of Object.entries(def.options)) {
      const v = node.options[name];
      if (!hasValue(v)) {
        if (opt.required) add(node.id, `option:${name}`, `Set ${name}.`, "error", name);
        continue;
      }
      const problem = optionProblem(name, opt, v);
      if (problem) add(node.id, `option:${name}`, problem, "error", name);
    }
    for (const name of Object.keys(node.options)) {
      if (!def.options[name]) {
        add(
          node.id,
          `unknown-option:${name}`,
          `${node.type} has no option ${name} in forte2 ${catalog.forte2_version}.`,
          "warning",
          name,
        );
      }
    }

    for (const [slot, sdef] of Object.entries(def.slots)) {
      const ids = node.slots[slot] ?? [];
      if (sdef.required && ids.length === 0) {
        add(node.id, `slot:${slot}`, `Add ${joinOr(sdef.accepts)} to ${slot}.`, "error", slot);
      }
      if (!sdef.many && ids.length > 1) {
        add(node.id, `slot:${slot}`, `${slot} takes one object.`, "error", slot);
      }
      for (const c of ids) {
        const ctype = doc.nodes[c]?.type;
        if (ctype && !sdef.accepts.includes(ctype)) {
          add(node.id, `slot:${slot}`, `${slot} takes ${joinOr(sdef.accepts)}, not ${ctype}.`, "error", slot);
        }
      }
    }
    for (const slot of Object.keys(node.slots)) {
      if (!def.slots[slot]) {
        add(node.id, `unknown-slot:${slot}`, `${node.type} has no argument ${slot}.`, "warning", slot);
      }
    }

    if (node.type === "State" || node.type === "RelState") {
      for (const p of stateProblems(node, ctx.system)) {
        add(node.id, `state:${p.field}`, p.message, "error", p.field);
      }
    }
    if (def.electrons) {
      for (const p of electronProblems(node, def.electrons, ctx.system)) {
        add(node.id, `electrons:${p.field}`, p.message, "error", p.field);
      }
    }

    for (const rule of def.rules) {
      // Upstream-only rules need an upstream to look at.
      if (!parentFacts && !ruleReferencesSelf(rule) && def.kind !== "system") continue;
      if (!ruleHolds(rule, ctx)) {
        add(
          node.id,
          `rule:${rule.message}`,
          rule.message,
          rule.severity ?? "error",
          rule.field,
          !ruleReferencesSelf(rule),
        );
      }
    }
  }

  const byNode: Record<string, Issue[]> = {};
  for (const i of issues) (byNode[i.nodeId] ??= []).push(i);
  return {
    facts,
    issues,
    byNode,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}
