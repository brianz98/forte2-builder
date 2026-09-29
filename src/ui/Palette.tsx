import { useMemo, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import { attachProblems } from "../rules/analyze";
import { chainNodeOf } from "../graph/ops";
import { Icon } from "./Icon";
import { PALETTE_MIME } from "./Canvas";

interface Entry {
  type: string;
  ok: boolean;
  reason?: string;
  hint: string;
}

export function Palette() {
  const catalog = useStore((s) => s.catalog);
  const doc = useStore((s) => s.doc);
  const analysis = useStore((s) => s.analysis);
  const selectedId = useStore((s) => s.selectedId);
  const addNode = useStore((s) => s.addNode);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ entry: Entry; top: number } | undefined>();

  const selected = selectedId ? doc.nodes[selectedId] : undefined;
  const chain = selected ? chainNodeOf(doc, selected.id) : undefined;
  const chainFacts = chain ? analysis.facts[chain.id] : undefined;

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const def of Object.values(catalog.nodes)) {
      let ok = true;
      let reason: string | undefined;
      let hint: string;
      if (def.kind === "system") {
        hint = "Starts a new chain.";
      } else if (def.kind === "solver" || def.kind === "value") {
        const slot = selected
          ? Object.entries(catalog.nodes[selected.type]?.slots ?? {}).find(([, s]) =>
              s.accepts.includes(def.name),
            )
          : undefined;
        ok = !!slot;
        hint = slot ? `Goes into ${selected!.type}.${slot[0]}.` : "";
        if (!slot) {
          const owners = Object.values(catalog.nodes)
            .filter((d) => Object.values(d.slots).some((s) => s.accepts.includes(def.name)))
            .map((d) => d.name);
          reason = `Select ${owners.length > 3 ? "a node that takes it" : owners.join(" or ")} to add ${def.name}.`;
        }
      } else if (chain && chainFacts) {
        const problems = attachProblems(catalog, doc, def.name, chain, chainFacts);
        ok = problems.length === 0;
        reason = problems[0]?.message;
        hint = ok ? `Follows ${chain.type}.` : "";
      } else {
        hint = chain ? "" : "Added unconnected; select a node to attach it.";
        ok = !chain;
        reason = chain ? `${chain.type} can't be followed.` : undefined;
      }
      out.push({ type: def.name, ok, reason, hint });
    }
    return out;
  }, [catalog, doc, selected, chain, chainFacts]);

  const q = query.trim().toLowerCase();
  const groups = Object.entries(catalog.groups).map(([key, g]) => ({
    key,
    ...g,
    items: entries.filter((e) => {
      const def = catalog.nodes[e.type];
      if (def.group !== key) return false;
      if (!q) return true;
      return (
        e.type.toLowerCase().includes(q) ||
        def.summary.toLowerCase().includes(q) ||
        (def.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }),
  }));

  const context = selected
    ? selected.owner
      ? `Adding inside or after ${selected.type}`
      : `Adding after ${selected.type}`
    : "Nothing selected: new nodes start unconnected";

  return (
    <aside className="palette" onMouseLeave={() => setHover(undefined)}>
      <div className="palette-search">
        <Icon name="search" size={14} />
        <input
          placeholder="Search methods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search methods"
        />
      </div>
      <div className="palette-context">{context}</div>
      <div className="palette-list">
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key} style={{ "--g": `var(--g-${g.color})` } as CSSProperties}>
              <h3>
                <span className="card-dot" />
                {g.label}
              </h3>
              {g.items.map((e) => (
                <button
                  key={e.type}
                  className={e.ok ? "palette-item" : "palette-item is-disabled"}
                  aria-disabled={!e.ok}
                  draggable={e.ok}
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData(PALETTE_MIME, e.type);
                    ev.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => e.ok && addNode(e.type)}
                  onMouseEnter={(ev) => {
                    const box = ev.currentTarget.getBoundingClientRect();
                    const parent = ev.currentTarget.closest(".palette")!.getBoundingClientRect();
                    setHover({ entry: e, top: box.top - parent.top });
                  }}
                >
                  <span className="palette-name">{e.type}</span>
                </button>
              ))}
            </section>
          ))}
      </div>
      {hover && (
        <div className="palette-tip" style={{ top: hover.top }}>
          <div className="tip-title">{hover.entry.type}</div>
          <div className="tip-body">{catalog.nodes[hover.entry.type].summary}</div>
          {hover.entry.ok ? (
            hover.entry.hint && <div className="tip-hint">{hover.entry.hint}</div>
          ) : (
            <div className="tip-reason">
              <Icon name="alert" size={13} />
              {hover.entry.reason}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
