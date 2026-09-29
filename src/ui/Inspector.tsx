import { useState, type CSSProperties } from "react";
import { useStore } from "../store";
import { chainNodeOf } from "../graph/ops";
import type { NodeDef, OptionDef } from "../catalog/types";
import type { GraphDoc, GraphNode } from "../graph/types";
import type { Catalog } from "../catalog/types";
import { chipText, electronsFromSystem } from "./summarize";
import { OptionField } from "./OptionField";
import { Icon } from "./Icon";

const FORTE2_REPO = "https://github.com/evangelistalab/forte2/blob/main/";

function groupStyle(catalog: Catalog, def: NodeDef): CSSProperties {
  return { "--g": `var(--g-${catalog.groups[def.group]?.color ?? "gray"})` } as CSSProperties;
}

// The charge of the nearest mean-field method upstream of `id`.
function upstreamCharge(doc: GraphDoc, catalog: Catalog, id: string): number {
  let node: GraphNode | undefined = chainNodeOf(doc, id);
  while (node) {
    if (catalog.nodes[node.type]?.group === "scf") return Number(node.options.charge ?? 0);
    node = node.parent ? doc.nodes[node.parent] : undefined;
  }
  return 0;
}

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const node = useStore((s) => (s.selectedId ? s.doc.nodes[s.selectedId] : undefined));
  if (!selectedId || !node) return <Overview />;
  return <NodeInspector key={selectedId} node={node} />;
}

function Overview() {
  const meta = useStore((s) => s.meta);
  const analysis = useStore((s) => s.analysis);
  const doc = useStore((s) => s.doc);
  const select = useStore((s) => s.select);
  const setTemplatesOpen = useStore((s) => s.setTemplatesOpen);
  return (
    <div className="inspector">
      <div className="overview">
        <div className="eyebrow">{meta.templateId ? "Template" : "Your input"}</div>
        <h2>{meta.title ?? "Untitled"}</h2>
        {meta.summary && <p className="lede">{meta.summary}</p>}
        {meta.tags && meta.tags.length > 0 && (
          <div className="tags">
            {meta.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
        {meta.results && meta.results.length > 0 && (
          <div className="results">
            <div className="section-label">Reference results</div>
            {meta.results.map((r) => (
              <div key={r.label} className="result">
                <span>{r.label}</span>
                <span className="mono">{r.value}</span>
              </div>
            ))}
            {meta.source && (
              <a className="source" href={FORTE2_REPO + meta.source} target="_blank" rel="noreferrer">
                From {meta.source}
                <Icon name="external" size={12} />
              </a>
            )}
          </div>
        )}
      </div>

      {analysis.issues.length === 0 ? (
        <div className="all-clear">
          <Icon name="check" size={14} /> The builder found no problems in this input.
        </div>
      ) : (
        <div className="section-label">
          {analysis.errors} error{analysis.errors === 1 ? "" : "s"}, {analysis.warnings} warning
          {analysis.warnings === 1 ? "" : "s"}
        </div>
      )}
      <div className="issue-list">
        {analysis.issues.map((i, k) => (
          <button key={k} className={`issue issue-${i.severity}`} onClick={() => select(i.nodeId)}>
            <Icon name={i.severity === "error" ? "alert" : "info"} size={14} />
            <span>
              <b>{doc.nodes[i.nodeId]?.type ?? i.nodeId}</b> {i.message}
            </span>
          </button>
        ))}
      </div>
      <div className="empty-help">
        <p>Select a node to edit its options. Click a method in the palette to add it after the selected node, or drag between handles to connect nodes.</p>
        <button className="btn" onClick={() => setTemplatesOpen(true)}>
          <Icon name="grid" size={14} /> Browse templates
        </button>
      </div>
    </div>
  );
}

function NodeInspector({ node }: { node: GraphNode }) {
  const catalog = useStore((s) => s.catalog);
  const doc = useStore((s) => s.doc);
  const analysis = useStore((s) => s.analysis);
  const select = useStore((s) => s.select);
  const setOption = useStore((s) => s.setOption);
  const removeNode = useStore((s) => s.removeNode);
  const disconnect = useStore((s) => s.disconnect);
  const changeType = useStore((s) => s.changeType);
  const addSlotChild = useStore((s) => s.addSlotChild);
  const [advanced, setAdvanced] = useState(false);
  const def = catalog.nodes[node.type];
  if (!def) return <div className="inspector">Unknown type {node.type}</div>;

  const issues = analysis.byNode[node.id] ?? [];
  const fieldIssue = (f: string) => issues.find((i) => i.field === f)?.message;
  const general = issues.filter((i) => !i.field || !(i.field in def.options));
  const siblings = Object.values(catalog.nodes).filter(
    (d) => d.kind === def.kind && d.group === def.group && d.name !== def.name,
  );
  const owner = node.owner ? doc.nodes[node.owner.id] : undefined;
  const parent = node.parent ? doc.nodes[node.parent] : undefined;

  const opts = Object.entries(def.options).filter(([, o]) => !o.hidden);
  const card = def.card ?? [];
  const rank = ([name, o]: [string, OptionDef]) =>
    o.required ? 0 : card.includes(name) ? 1 + card.indexOf(name) / 100 : 2;
  const basic = opts.filter(([, o]) => !o.advanced).sort((a, b) => rank(a) - rank(b));
  const extra = opts.filter(([, o]) => o.advanced);

  const nelHint = (name: string) => {
    if (name !== "nel") return undefined;
    const charge =
      node.type === "State" || node.type === "RelState"
        ? Number(node.options.charge ?? 0)
        : upstreamCharge(doc, catalog, node.id);
    const n = electronsFromSystem(doc, catalog, node.id, charge);
    return n === undefined ? undefined : `The System has ${n} electrons at charge ${charge}.`;
  };

  const field = ([name, o]: [string, OptionDef]) => (
    <OptionField
      key={name}
      name={name}
      opt={o}
      value={node.options[name]}
      error={fieldIssue(name)}
      hint={nelHint(name)}
      onChange={(v) => setOption(node.id, name, v)}
    />
  );

  return (
    <div className="inspector" style={groupStyle(catalog, def)}>
      {owner && (
        <button className="crumb" onClick={() => select(owner.id)}>
          <Icon name="chevron" size={12} />
          in {owner.type}.{node.owner!.slot}
        </button>
      )}
      <div className="insp-head">
        <span className="card-dot big" />
        <div>
          <h2>{node.type}</h2>
          <div className="insp-sub">{catalog.groups[def.group]?.label}</div>
        </div>
        <div className="insp-actions">
          {def.api && (
            <a className="icon-btn" href={def.api} target="_blank" rel="noreferrer" title="API reference">
              <Icon name="book" size={15} />
            </a>
          )}
          <button className="icon-btn danger" title="Delete (Del)" onClick={() => removeNode(node.id)}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>
      <p className="lede">{def.summary}</p>

      {siblings.length > 0 && (
        <label className="swap">
          <Icon name="swap" size={13} />
          <span>Switch to</span>
          <select value="" onChange={(e) => e.target.value && changeType(node.id, e.target.value)}>
            <option value="">choose…</option>
            {siblings.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!node.owner && def.kind !== "system" && (
        <div className="upstream">
          {parent ? (
            <>
              <span>
                Follows <button className="link" onClick={() => select(parent.id)}>{parent.type}</button>
              </span>
              <button className="btn ghost small" onClick={() => disconnect(node.id)}>
                <Icon name="unlink" size={13} /> Disconnect
              </button>
            </>
          ) : (
            <span className="muted">
              Not connected. Drag from an upstream node's output handle to this node's input handle.
            </span>
          )}
        </div>
      )}

      {general.length > 0 && (
        <div className="issue-list">
          {general.map((i, k) => (
            <div key={k} className={`issue issue-${i.severity}`}>
              <Icon name={i.severity === "error" ? "alert" : "info"} size={14} />
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}

      {Object.entries(def.slots).map(([slot, sdef]) => {
        const ids = node.slots[slot] ?? [];
        const canAdd = sdef.many || ids.length === 0;
        return (
          <div key={slot} className="slot">
            <div className="field-head">
              <span className="field-name">
                {slot}
                {sdef.required && <span className="req">required</span>}
              </span>
            </div>
            {ids.map((cid) => {
              const child = doc.nodes[cid];
              const cdef = catalog.nodes[child.type];
              const bad = analysis.byNode[cid]?.length;
              return (
                <div key={cid} className={`slot-item${bad ? " has-error" : ""}`} style={groupStyle(catalog, cdef)}>
                  <button className="slot-open" onClick={() => select(cid)}>
                    <span className="card-dot" />
                    <b>{child.type}</b>
                    <span className="muted">{chipText(doc, catalog, child, cdef)}</span>
                  </button>
                  <button className="icon-btn tiny" title="Remove" onClick={() => removeNode(cid)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              );
            })}
            {(canAdd || sdef.accepts.length > 1) && (
              <select
                className="input add-select"
                value=""
                onChange={(e) => e.target.value && addSlotChild(node.id, slot, e.target.value)}
              >
                <option value="">{canAdd ? "+ Add" : "Replace with"}…</option>
                {sdef.accepts.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            {sdef.doc && <div className="field-doc">{sdef.doc}</div>}
          </div>
        );
      })}

      <div className="fields">{basic.map(field)}</div>
      {extra.length > 0 && (
        <>
          <button className="disclosure" onClick={() => setAdvanced(!advanced)}>
            <span className={advanced ? "chev is-open" : "chev"}>
              <Icon name="chevron" size={12} />
            </span>
            Advanced ({extra.length})
          </button>
          {advanced && <div className="fields">{extra.map(field)}</div>}
        </>
      )}
    </div>
  );
}
