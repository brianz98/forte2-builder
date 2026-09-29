import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "./store";
import { TopBar } from "./ui/TopBar";
import { Palette } from "./ui/Palette";
import { Canvas } from "./ui/Canvas";
import { Inspector } from "./ui/Inspector";
import { CodePanel } from "./ui/CodePanel";
import { TemplatesModal } from "./ui/TemplatesModal";
import { DesignPanel } from "./ui/DesignPanel";
import { Icon } from "./ui/Icon";
import { FixButtons } from "./ui/FixButtons";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.templatesOpen || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selectedId) {
        e.preventDefault();
        s.removeNode(s.selectedId);
      } else if (e.key === "Escape") {
        s.select(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useTheme() {
  const theme = useStore((s) => s.design.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!toast || hovered) return;
    const ms = toast.fixes ? 12000 : toast.kind === "error" ? 5200 : 3200;
    const t = setTimeout(dismiss, ms);
    return () => clearTimeout(t);
  }, [toast, hovered, dismiss]);
  if (!toast) return null;
  return (
    <div
      className={`toast toast-${toast.kind}`}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon name={toast.kind === "error" ? "alert" : "info"} size={15} />
      <div className="toast-body">
        <span>{toast.message}</span>
        {toast.fixes && <FixButtons fixes={toast.fixes} />}
      </div>
      <button className="toast-close" onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

function CatalogProblems() {
  const problems = useStore((s) => s.catalogProblems);
  if (!problems.length || !import.meta.env.DEV) return null;
  return (
    <div className="catalog-problems">
      <b>Catalog problems</b>
      {problems.map((p) => (
        <div key={p}>{p}</div>
      ))}
    </div>
  );
}

function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const setTab = useStore((s) => s.setRightTab);
  const errors = useStore((s) => s.analysis.errors);
  return (
    <aside className="right">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "inspect"} className={tab === "inspect" ? "tab is-on" : "tab"} onClick={() => setTab("inspect")}>
          Inspector
        </button>
        <button role="tab" aria-selected={tab === "code"} className={tab === "code" ? "tab is-on" : "tab"} onClick={() => setTab("code")}>
          <Icon name="code" size={14} /> Python
          {errors > 0 && <span className="pill pill-error">{errors}</span>}
        </button>
      </div>
      <div className="tab-body">{tab === "inspect" ? <Inspector /> : <CodePanel />}</div>
    </aside>
  );
}

export function App() {
  useShortcuts();
  useTheme();
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <main className="workspace">
          <Palette />
          <section className="canvas">
            <Canvas />
            <DesignPanel />
            <CatalogProblems />
          </section>
          <RightPanel />
        </main>
        <TemplatesModal />
        <Toast />
      </div>
    </ReactFlowProvider>
  );
}
