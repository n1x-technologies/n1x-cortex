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

// ── Viewer (Phase 1) ───────────────────────────────────────────────
export type Freshness = 'gap' | 'stale' | 'draft' | 'verified' | 'fresh';

export interface VizNode {
  id: string;
  title: string;
  type: string | null;
  status: string | null;
  folder: string;
  freshness: Freshness;
  exists: boolean;
  degree: number;
}

export interface VizEdge {
  source: string;
  target: string;
  context: string | null;
  dangling: boolean;
}

export interface VizStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  orphans: number;
  draftsPending: number;
  missingCitations: number;
}

export interface ViewerData {
  nodes: VizNode[];
  edges: VizEdge[];
  stats: VizStats;
  lang: string | null;
  generatedAt: number;
}

// ── Query (Phase 2) ────────────────────────────────────────────────
export interface QueryHit {
  path: string;
  id: string;
  title: string;
  type: string | null;
  score: number;
  excerpt: string;
  source: string | null;
  via: 'anchor' | 'link';
}

export interface QueryResult {
  question: string;
  anchors: string[];
  hits: QueryHit[];
  sources: string[];
}

// ── Atomize (Phase 3) ──────────────────────────────────────────────
export interface NoteSpec {
  id: string;
  title: string;
  type: string | null;
  body: string;
  source: string;
  status: string;
  folder: string | null;
}
export type AtomizeAction = 'create' | 'update' | 'skip';
export interface AtomizePlanItem {
  spec: NoteSpec;
  action: AtomizeAction;
  matchPath: string | null;
  destPath: string;
}
export interface AtomizePlan {
  source: string;
  items: AtomizePlanItem[];
  dryRun: boolean;
}
export interface Segment {
  heading: string;
  level: number;
  body: string;
}
