import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from "@xyflow/react";
import { connectionProblem, useStore } from "../store";
import { NodeCard } from "./NodeCard";
import { layoutPositions } from "./layout";
import { chainNodeOf, slotDescendants } from "../graph/ops";

const nodeTypes = { card: NodeCard };
export const PALETTE_MIME = "application/x-forte2-type";

const EDGE_TYPES = { smoothstep: "smoothstep", bezier: "default", step: "step", straight: "straight" };

export function Canvas() {
  const doc = useStore((s) => s.doc);
  const catalog = useStore((s) => s.catalog);
  const analysis = useStore((s) => s.analysis);
  const design = useStore((s) => s.design);
  const layout = useStore((s) => s.layout);
  const placement = useStore((s) => s.placement);
  const generation = useStore((s) => s.generation);
  const select = useStore((s) => s.select);
  const connect = useStore((s) => s.connect);
  const addNode = useStore((s) => s.addNode);
  const explainConnection = useStore((s) => s.explainConnection);
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [fitNonce, setFitNonce] = useState(0);
  const pending = useRef<{ nonce: number; fit: boolean } | null>(layout);
  const running = useRef(false);

  // Nodes shown on the canvas: every top-level node, plus slot contents when
  // they are drawn as separate nodes.
  const wanted = useMemo(() => {
    const ids = Object.values(doc.nodes)
      .filter((n) => !n.owner || design.slots === "separate")
      .map((n) => n.id);
    return ids;
  }, [doc, design.slots]);

  // A new graph starts from fresh canvas nodes, so none keeps the size of an
  // old node that happened to share its id.
  useEffect(() => {
    if (generation) setNodes([]);
  }, [generation, setNodes]);

  useEffect(() => {
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return wanted.map((id) => {
        const existing = byId.get(id);
        if (existing) return existing;
        const node = doc.nodes[id];
        let position = placement[id];
        if (!position && node.parent && byId.get(node.parent)) {
          const p = byId.get(node.parent)!;
          const w = p.measured?.width ?? 240;
          const h = p.measured?.height ?? 120;
          position =
            design.direction === "RIGHT"
              ? { x: p.position.x + w + 72, y: p.position.y }
              : { x: p.position.x, y: p.position.y + h + 72 };
        }
        if (!position) {
          const el = document.querySelector(".react-flow");
          const r = el?.getBoundingClientRect();
          position = r
            ? rf.screenToFlowPosition({ x: r.left + r.width / 2 - 120, y: r.top + r.height / 3 })
            : { x: 0, y: 0 };
        }
        const hide = design.autoLayout && !placement[id];
        return {
          id,
          type: "card",
          position,
          data: { nodeId: id },
          className: hide ? "unplaced" : undefined,
        } satisfies Node;
      });
    });
  }, [wanted, doc, placement, design.direction, design.autoLayout, setNodes, rf]);

  useEffect(() => {
    pending.current = layout;
  }, [layout]);

  // Pan to the selected node when a layout moved it out of view.
  const revealSelected = useCallback(
    (pos: Record<string, { x: number; y: number }>, sized: { id: string; width: number; height: number }[]) => {
      const id = useStore.getState().selectedId;
      const target = id && useStore.getState().doc.nodes[id] ? chainNodeOf(useStore.getState().doc, id).id : undefined;
      const p = target ? pos[target] : undefined;
      const size = sized.find((s) => s.id === target);
      const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
      if (!p || !size || !pane) return;
      const tl = rf.flowToScreenPosition(p);
      const br = rf.flowToScreenPosition({ x: p.x + size.width, y: p.y + size.height });
      const inside = tl.x >= pane.left && tl.y >= pane.top && br.x <= pane.right && br.y <= pane.bottom;
      if (!inside) {
        void rf.setCenter(p.x + size.width / 2, p.y + size.height / 2, { zoom: rf.getZoom(), duration: 300 });
      }
    },
    [rf],
  );

  // Run ELK once every node on the canvas has been measured.
  useEffect(() => {
    const req = pending.current;
    if (!req || running.current) return;
    if (!design.autoLayout && !req.fit) {
      pending.current = null;
      setNodes((ns) => ns.map((n) => (n.className ? { ...n, className: undefined } : n)));
      return;
    }
    // Wait until the canvas shows exactly the document's nodes, all measured.
    const shown = new Set(nodes.map((n) => n.id));
    if (nodes.length !== wanted.length || wanted.some((id) => !shown.has(id))) return;
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.width || !n.measured?.height)) return;
    running.current = true;
    pending.current = null;
    const sized = nodes.map((n) => ({ id: n.id, width: n.measured!.width!, height: n.measured!.height! }));
    layoutPositions(doc, sized, design)
      .then((pos) => {
        setNodes((ns) =>
          ns.map((n) =>
            pos[n.id] ? { ...n, position: pos[n.id], className: undefined } : { ...n, className: undefined },
          ),
        );
        if (req.fit) {
          setFitNonce((k) => k + 1);
        } else {
          revealSelected(pos, sized);
        }
      })
      .finally(() => {
        running.current = false;
      });
  }, [nodes, wanted, doc, design, layout, rf, setNodes, revealSelected]);

  // Fit once React Flow has the new positions; its store updates in a child
  // effect, which runs before this one.
  useEffect(() => {
    if (fitNonce) void rf.fitView({ padding: 0.08, duration: 300, maxZoom: 1 });
  }, [fitNonce, rf]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const type = EDGE_TYPES[design.edge];
    for (const n of Object.values(doc.nodes)) {
      if (n.owner || !n.parent || !doc.nodes[n.parent]) continue;
      const related = [n.id, ...slotDescendants(doc, n.id)];
      const bad = related.some((id) => (analysis.byNode[id] ?? []).some((i) => i.connection && i.severity === "error"));
      const twoC = analysis.facts[n.parent]?.attrs.two_component === true;
      out.push({
        id: `e:${n.parent}->${n.id}`,
        source: n.parent,
        target: n.id,
        sourceHandle: "out",
        targetHandle: "in",
        type,
        className: [bad && "edge-error", twoC && design.twoComponent === "edge" && "edge-2c"]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (design.slots === "separate") {
      for (const n of Object.values(doc.nodes)) {
        if (!n.owner) continue;
        out.push({
          id: `s:${n.owner.id}->${n.id}`,
          source: n.owner.id,
          target: n.id,
          sourceHandle: "slots",
          targetHandle: "owned",
          type: "smoothstep",
          className: "edge-slot",
          selectable: false,
          focusable: false,
        });
      }
    }
    return out;
  }, [doc, analysis, design.edge, design.slots, design.twoComponent]);

  const isValidConnection = useCallback(
    (c: Connection | Edge) => !connectionProblem(useStore.getState(), c.source, c.target),
    [],
  );

  const onConnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || !state.toNode) return;
      const [parent, child] =
        state.fromHandle?.type === "source"
          ? [state.fromNode.id, state.toNode.id]
          : [state.toNode.id, state.fromNode.id];
      explainConnection(parent, child);
    },
    [explainConnection],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(PALETTE_MIME);
      if (!type || !catalog.nodes[type]) return;
      e.preventDefault();
      addNode(type, rf.screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 20 }));
    },
    [addNode, catalog, rf],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => select(n.id)}
      onEdgeClick={(_, e) => select(e.target)}
      onPaneClick={() => select(undefined)}
      onConnect={(c) => connect(c.source, c.target)}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
      elementsSelectable={false}
      deleteKeyCode={null}
      minZoom={0.2}
      maxZoom={2}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      {design.minimap && <MiniMap pannable zoomable position="bottom-right" />}
    </ReactFlow>
  );
}
