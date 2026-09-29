// In memory, a graph is a flat map of nodes. Chain nodes link to their
// upstream through `parent`; objects passed as constructor arguments (a solver
// inside a driver, a State inside a solver) link to their owner through `owner`
// and are listed in the owner's `slots`.

export interface GraphNode {
  id: string;
  type: string;
  options: Record<string, unknown>;
  slots: Record<string, string[]>;
  parent?: string;
  owner?: { id: string; slot: string };
}

export interface GraphDoc {
  nodes: Record<string, GraphNode>;
}

// On disk (templates, imports and exports), slot children are nested inline.
export interface FileNode {
  id?: string;
  type: string;
  parent?: string;
  options?: Record<string, unknown>;
  slots?: Record<string, FileNode | FileNode[]>;
}

export interface TemplateResult {
  label: string;
  value: string;
}

export interface GraphMeta {
  title?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  source?: string;
  results?: TemplateResult[];
  order?: number;
}

export interface GraphFile extends GraphMeta {
  format: "forte2-graph/1";
  forte2_version?: string;
  nodes: FileNode[];
}
