import { useEffect, type CSSProperties } from "react";
import { useStore } from "../store";
import { templates } from "../templates";
import { Icon } from "./Icon";

export function TemplatesModal() {
  const open = useStore((s) => s.templatesOpen);
  const setOpen = useStore((s) => s.setTemplatesOpen);
  const loadGraph = useStore((s) => s.loadGraph);
  const catalog = useStore((s) => s.catalog);
  const current = useStore((s) => s.meta.templateId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-label="Templates" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Templates</h2>
            <p className="lede">
              Each template is a forte2 test input. Its reference results come from the test's assertions.
            </p>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="template-grid">
          {templates.map((t) => {
            const types = [...new Set(t.file.nodes.map((n) => n.type))];
            return (
              <button
                key={t.id}
                className={`template${current === t.id ? " is-current" : ""}`}
                onClick={() => loadGraph(t.file, t.id)}
              >
                <div className="template-flow">
                  {types.map((type, i) => {
                    const def = catalog.nodes[type];
                    const color = def ? catalog.groups[def.group]?.color : "gray";
                    return (
                      <span key={type} className="flow-step" style={{ "--g": `var(--g-${color})` } as CSSProperties}>
                        {i > 0 && <span className="flow-arrow">→</span>}
                        <span className="flow-chip">{type}</span>
                      </span>
                    );
                  })}
                </div>
                <h3>{t.file.title}</h3>
                <p>{t.file.summary}</p>
                <div className="tags">
                  {(t.file.tags ?? []).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                {t.file.results?.[t.file.results.length - 1] && (
                  <div className="template-result">
                    <span>{t.file.results[t.file.results.length - 1].label}</span>
                    <span className="mono">{t.file.results[t.file.results.length - 1].value}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
