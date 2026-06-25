export const DEFAULT_LIFECYCLE = ['draft', 'documented', 'verified'] as const;

export interface NoteLink {
  target: string;          // the raw [[target]] text (without brackets, before any | alias)
  heading: string | null;  // the nearest heading above the link, or null
}

export interface Note {
  path: string;                       // vault-relative path, e.g. "01-Conceptos/foo.md"
  id: string;                         // frontmatter id, else filename without extension
  title: string;                      // first H1, else filename without extension
  type: string | null;
  status: string | null;
  tags: string[];
  meta: Record<string, unknown>;      // all frontmatter keys not mapped above
  folder: string;                     // top-level folder, e.g. "01-Conceptos"
  links: NoteLink[];
  source: string | null;
  body: string;
}

export interface CortexFields { type: string; status: string; id: string; source: string; }

export interface CortexConfig {
  vaultRoot: string;
  sourcesDir: string;
  lang: string | null;
  fields: CortexFields;
  statusLifecycle: string[];
  immutableStatus: string | null;
  autonomy: 'off' | 'suggest' | 'auto-draft' | 'full';
  viz: { port: number };
}

export interface GraphNode { key: string; note: Note | null; exists: boolean; }
export interface GraphEdge { from: string; to: string; heading: string | null; }
export interface Graph {
  nodes: Map<string, GraphNode>;  // keyed by resolution key (id / title / basename)
  edges: GraphEdge[];
  orphans: string[];              // link targets with no matching note
}
