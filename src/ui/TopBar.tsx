import { useRef } from "react";
import { load as loadYaml } from "js-yaml";
import { useStore, type Theme } from "../store";
import type { GraphFile } from "../graph/types";
import { Icon } from "./Icon";

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON: Record<Theme, string> = { system: "monitor", light: "sun", dark: "moon" };

export function TopBar() {
  const catalog = useStore((s) => s.catalog);
  const meta = useStore((s) => s.meta);
  const design = useStore((s) => s.design);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const showDesign = useStore((s) => s.showDesign);
  const s = useStore.getState;
  const fileInput = useRef<HTMLInputElement>(null);

  const exportGraph = () => {
    const file = s().exportFile();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(meta.title ?? "forte2_graph").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importGraph = async (f: File) => {
    try {
      const text = await f.text();
      s().loadGraph(loadYaml(text) as GraphFile);
    } catch (e) {
      s().showToast(`Couldn't read ${f.name}: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--accent)" />
          <circle cx="9" cy="16" r="3.2" fill="#fff" />
          <circle cx="23" cy="9" r="3.2" fill="#fff" />
          <circle cx="23" cy="23" r="3.2" fill="#fff" />
          <path d="M12 15l8-5M12 17l8 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="brand-name">
          forte2 <span className="muted">builder</span>
        </span>
        <span className="version" title="Catalog version">
          forte2 {catalog.forte2_version}
        </span>
      </div>
      <div className="doc-title" title={meta.summary}>
        {meta.title ?? "Untitled"}
      </div>
      <nav className="actions">
        <button className="btn primary" onClick={() => s().setTemplatesOpen(true)}>
          <Icon name="grid" size={14} /> Templates
        </button>
        <button className="btn ghost" onClick={() => s().newGraph()} title="Start from an empty System">
          <Icon name="plus" size={14} /> New
        </button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => s().undo()} disabled={!past} title="Undo (⌘Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => s().redo()} disabled={!future} title="Redo (⇧⌘Z)">
          <Icon name="redo" />
        </button>
        <button className="icon-btn" onClick={() => s().requestLayout(true)} title="Tidy layout">
          <Icon name="tidy" />
        </button>
        <span className="sep" />
        <button className="icon-btn" onClick={() => fileInput.current?.click()} title="Open a graph file (.json or .yaml)">
          <Icon name="upload" />
        </button>
        <button className="icon-btn" onClick={exportGraph} title="Save the graph as JSON">
          <Icon name="download" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.yaml,.yml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importGraph(f);
            e.target.value = "";
          }}
        />
        <span className="sep" />
        <button
          className="icon-btn"
          onClick={() => s().setDesign({ theme: NEXT_THEME[design.theme] })}
          title={`Theme: ${design.theme}`}
        >
          <Icon name={THEME_ICON[design.theme]} />
        </button>
        <button
          className={`icon-btn${showDesign ? " is-on" : ""}`}
          onClick={() => s().setShowDesign(!s().showDesign)}
          title="Design variants"
        >
          <Icon name="sliders" />
        </button>
      </nav>
    </header>
  );
}
