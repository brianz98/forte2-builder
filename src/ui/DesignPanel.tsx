import { defaultDesign, useStore, type DesignPrefs } from "../store";
import { Icon } from "./Icon";

type Choice<K extends keyof DesignPrefs> = { key: K; label: string; options: [DesignPrefs[K], string][] };

const CHOICES = [
  { key: "direction", label: "Flow", options: [["DOWN", "Top to bottom"], ["RIGHT", "Left to right"]] },
  { key: "density", label: "Cards", options: [["detailed", "Detailed"], ["compact", "Compact"]] },
  { key: "slots", label: "Arguments", options: [["docked", "Inside the card"], ["separate", "Separate nodes"]] },
  { key: "accent", label: "Group color", options: [["top", "Top bar"], ["left", "Left bar"], ["tint", "Tinted header"]] },
  { key: "twoComponent", label: "Two-component", options: [["badge", "Badge"], ["stripe", "Stripe"], ["edge", "Edge color"]] },
  { key: "edge", label: "Edges", options: [["smoothstep", "Rounded"], ["bezier", "Curved"], ["step", "Square"], ["straight", "Straight"]] },
] as Choice<keyof DesignPrefs>[];

export function DesignPanel() {
  const show = useStore((s) => s.showDesign);
  const design = useStore((s) => s.design);
  const setDesign = useStore((s) => s.setDesign);
  const setShow = useStore((s) => s.setShowDesign);
  const requestLayout = useStore((s) => s.requestLayout);
  if (!show) return null;
  return (
    <div className="design-panel" role="dialog" aria-label="Design variants">
      <div className="design-head">
        <b>Design variants</b>
        <button className="icon-btn tiny" onClick={() => setShow(false)} aria-label="Close">
          <Icon name="x" size={13} />
        </button>
      </div>
      {CHOICES.map((c) => (
        <div key={c.key} className="design-row">
          <span className="design-label">{c.label}</span>
          <div className="segmented small">
            {c.options.map(([value, label]) => (
              <button
                key={String(value)}
                className={`seg${design[c.key] === value ? " is-on" : ""}`}
                onClick={() => setDesign({ [c.key]: value } as Partial<DesignPrefs>)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="design-row">
        <span className="design-label">Layout</span>
        <div className="segmented small">
          <button
            className={`seg${design.autoLayout ? " is-on" : ""}`}
            onClick={() => setDesign({ autoLayout: !design.autoLayout })}
          >
            Auto layout on edits
          </button>
          <button className={`seg${design.minimap ? " is-on" : ""}`} onClick={() => setDesign({ minimap: !design.minimap })}>
            Minimap
          </button>
        </div>
      </div>
      <div className="design-foot">
        <button className="btn ghost small" onClick={() => setDesign({ ...defaultDesign, theme: design.theme })}>
          Reset
        </button>
        <button className="btn ghost small" onClick={() => requestLayout(true)}>
          <Icon name="tidy" size={13} /> Tidy now
        </button>
      </div>
    </div>
  );
}
