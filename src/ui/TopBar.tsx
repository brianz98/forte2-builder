import { useRef } from "react";
import { load as loadYaml } from "js-yaml";
import { useStore, type Theme } from "../store";
import type { GraphFile } from "../graph/types";
import { Icon } from "./Icon";
import logoUrl from "../assets/forte2-logo.png";

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON: Record<Theme, string> = { system: "monitor", light: "sun", dark: "moon" };

const REPO_URL = "https://github.com/brianz98/forte2-builder";
// The GitHub mark, from Octicons (MIT).
const GITHUB_MARK =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";

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
        <img className="brand-logo" src={logoUrl} alt="Forte2" width={69} height={23} />
        <span className="brand-name">input builder</span>
        {catalog.release ? (
          <a
            className="version"
            href={catalog.release.url}
            target="_blank"
            rel="noreferrer"
            title="The forte2 release this builder describes"
          >
            {catalog.release.tag}
          </a>
        ) : (
          <span className="version">forte2 {catalog.forte2_version}</span>
        )}
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
        <a
          className="icon-btn"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
          aria-label="Source on GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d={GITHUB_MARK} />
          </svg>
        </a>
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
