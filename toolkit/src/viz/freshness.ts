import type { Freshness } from '../types.js';

export function computeFreshness(o: {
  exists: boolean;
  stale: boolean;
  status: string | null;
  draftStatus: string | null;
  verifiedStatus: string | null;
}): Freshness {
  if (!o.exists) return 'gap';
  if (o.stale) return 'stale';
  if (o.draftStatus && o.status === o.draftStatus) return 'draft';
  if (o.verifiedStatus && o.status === o.verifiedStatus) return 'verified';
  return 'fresh';
}
