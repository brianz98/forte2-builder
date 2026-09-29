import { memo, type CSSProperties, type MouseEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useStore } from "../store";
import { slotDescendants } from "../graph/ops";
import { chipText, showOption, systemFormula, toSubscript } from "./summarize";
import type { Issue } from "../rules/analyze";

export type CardData = { nodeId: string };

function cls(...names: (string | false | undefined | null)[]) {
  return names.filter(Boolean).join(" ");
}

function worst(issues: Issue[] | undefined): "error" | "warning" | undefined {
  if (!issues?.length) return undefined;
  return issues.some((i) => i.severity === "error") ? "error" : "warning";
}

export const NodeCard = memo(function NodeCard({ data }: NodeProps) {
  const { nodeId } = data as CardData;
  const node = useStore((s) => s.doc.nodes[nodeId]);
  const doc = useStore((s) => s.doc);
  const catalog = useStore((s) => s.catalog);
  const analysis = useStore((s) => s.analysis);
  const selectedId = useStore((s) => s.selectedId);
  const design = useStore((s) => s.design);
  const select = useStore((s) => s.select);
  if (!node) return null;
  const def = catalog.nodes[node.type];
  if (!def) {
    return <div className="card has-error">Unknown type {node.type}</div>;
  }
  const docked = design.slots === "docked";
  const group = catalog.groups[def.group];
  const own = analysis.byNode[nodeId] ?? [];
  const nested = docked
    ? slotDescendants(doc, nodeId).flatMap((id) => analysis.byNode[id] ?? [])
    : [];
  const all = [...own, ...nested];
  const level = worst(all);
  const chainFacts = analysis.facts[node.owner ? "" : nodeId];
  const twoC = chainFacts?.attrs.two_component === true && def.kind !== "system";
  const horizontal = design.direction === "RIGHT";
  const isChain = def.kind === "system" || def.kind === "method" || def.kind === "driver";
  const style = { "--g": `var(--g-${group?.color ?? "gray"})` } as CSSProperties;

  const selectChild = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    select(id);
  };

  const rows = (def.card ?? []).filter((name) => def.options[name]);
  const slotsOnCard = (def.card ?? []).filter((name) => def.slots[name]);
  const otherSlots = Object.keys(def.slots).filter(
    (s) => !slotsOnCard.includes(s) && (node.slots[s]?.length ?? 0) > 0,
  );
  const formulaText = node.type === "System" ? systemFormula(node) : undefined;
  const kindLabel = node.owner ? node.owner.slot : (group?.label ?? "");

  return (
    <div
      className={cls(
        "card",
        `kind-${def.kind}`,
        `accent-${design.accent}`,
        `density-${design.density}`,
        selectedId === nodeId && "is-selected",
        level && `has-${level}`,
        twoC && "is-2c",
        twoC && `tc-${design.twoComponent}`,
      )}
      style={style}
    >
      {isChain && def.kind !== "system" && (
        <Handle type="target" id="in" position={horizontal ? Position.Left : Position.Top} />
      )}
      {isChain && (def.provides?.length ?? 0) > 0 && (
        <Handle type="source" id="out" position={horizontal ? Position.Right : Position.Bottom} />
      )}
      {!docked && Object.keys(node.slots).some((s) => node.slots[s].length) && (
        <Handle type="source" id="slots" position={Position.Bottom} className="slot-handle" isConnectable={false} />
      )}
      {!docked && node.owner && (
        <Handle type="target" id="owned" position={Position.Left} className="slot-handle" isConnectable={false} />
      )}

      <div className="card-head">
        <span className="card-dot" />
        <span className="card-title">{node.type}</span>
        {twoC && design.twoComponent === "badge" && <span className="pill pill-2c">2c</span>}
        {level && <span className={cls("pill", `pill-${level}`)}>{all.length}</span>}
        {kindLabel.toLowerCase() !== node.type.toLowerCase() && <span className="card-kind">{kindLabel}</span>}
      </div>

      {design.density === "detailed" ? (
        <div className="card-body">
          {formulaText && (
            <div className="card-formula">
              {toSubscript(formulaText)}
            </div>
          )}
          {node.type === "HubbardModel" && (
            <div className="card-formula">Hubbard</div>
          )}
          {rows.map((name) => {
            const shown = showOption(node, name, def.options[name]);
            return (
              <div key={name} className={cls("row", own.some((i) => i.field === name) && "row-bad")}>
                <span className="row-key">{name}</span>
                <span className={cls("row-val", shown.muted && "muted", shown.missing && "missing")}>
                  {shown.text}
                </span>
              </div>
            );
          })}
          {docked &&
            [...slotsOnCard, ...otherSlots].map((slot) =>
              (node.slots[slot] ?? []).map((cid) => (
                <Docked key={cid} id={cid} onSelect={selectChild} />
              )),
            )}
        </div>
      ) : (
        <div className="card-compact">
          {formulaText ? toSubscript(formulaText) + " · " : ""}
          {rows
            .slice(0, 2)
            .map((name) => showOption(node, name, def.options[name]).text)
            .join(" · ")}
          {docked &&
            Object.values(node.slots)
              .flat()
              .map((cid) => (
                <button key={cid} className="mini-chip" onClick={(e) => selectChild(e, cid)}>
                  {doc.nodes[cid]?.type}
                </button>
              ))}
        </div>
      )}
    </div>
  );
});

function Docked({ id, onSelect }: { id: string; onSelect: (e: MouseEvent, id: string) => void }) {
  const node = useStore((s) => s.doc.nodes[id]);
  const doc = useStore((s) => s.doc);
  const catalog = useStore((s) => s.catalog);
  const analysis = useStore((s) => s.analysis);
  const selectedId = useStore((s) => s.selectedId);
  if (!node) return null;
  const def = catalog.nodes[node.type];
  if (!def) return null;
  const group = catalog.groups[def.group];
  const level = worst(analysis.byNode[id]);
  const style = { "--g": `var(--g-${group?.color ?? "gray"})` } as CSSProperties;

  if (def.kind === "value") {
    return (
      <button
        className={cls("chip", selectedId === id && "is-selected", level && `has-${level}`)}
        style={style}
        onClick={(e) => onSelect(e, id)}
        title={`${node.type} in ${node.owner?.slot}`}
      >
        <span className="chip-type">{node.type}</span>
        <span className="chip-text">{chipText(doc, catalog, node, def)}</span>
      </button>
    );
  }

  const rows = (def.card ?? []).filter(
    (name) => def.options[name] && node.options[name] !== undefined,
  );
  return (
    <div
      className={cls("sub", selectedId === id && "is-selected", level && `has-${level}`)}
      style={style}
      onClick={(e) => onSelect(e, id)}
    >
      <div className="sub-head">
        <span className="card-dot" />
        <span className="sub-title">{node.type}</span>
        {level && <span className={cls("pill", `pill-${level}`)}>{analysis.byNode[id]!.length}</span>}
        <span className="card-kind">{node.owner?.slot}</span>
      </div>
      {rows.map((name) => (
        <div key={name} className="row">
          <span className="row-key">{name}</span>
          <span className="row-val">{showOption(node, name, def.options[name]).text}</span>
        </div>
      ))}
      {Object.values(node.slots)
        .flat()
        .map((cid) => (
          <Docked key={cid} id={cid} onSelect={onSelect} />
        ))}
    </div>
  );
}
