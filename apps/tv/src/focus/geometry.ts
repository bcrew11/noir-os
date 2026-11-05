export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Candidate { id: string; rect: Rect }

const cx = (r: Rect) => (r.left + r.right) / 2;
const cy = (r: Rect) => (r.top + r.bottom) / 2;

/**
 * Pick the best focus target in a direction.
 *
 * Candidates must lie in the half-plane of the direction. Score favours, in order:
 * overlap on the perpendicular axis (stay in the same row/column), small gap along the
 * direction of travel, then small perpendicular offset.
 */
export function pickBest(from: Rect, candidates: Candidate[], dir: Direction): string | null {
  const horizontal = dir === 'left' || dir === 'right';
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const r = c.rect;
    let gap: number;
    switch (dir) {
      case 'right': if (cx(r) <= cx(from) + 1 || r.right <= from.right - 1) continue; gap = r.left - from.right; break;
      case 'left': if (cx(r) >= cx(from) - 1 || r.left >= from.left + 1) continue; gap = from.left - r.right; break;
      case 'down': if (cy(r) <= cy(from) + 1 || r.bottom <= from.bottom - 1) continue; gap = r.top - from.bottom; break;
      case 'up': if (cy(r) >= cy(from) - 1 || r.top >= from.top + 1) continue; gap = from.top - r.bottom; break;
    }
    const overlap = horizontal
      ? Math.min(from.bottom, r.bottom) - Math.max(from.top, r.top)
      : Math.min(from.right, r.right) - Math.max(from.left, r.left);
    const perp = horizontal ? Math.abs(cy(r) - cy(from)) : Math.abs(cx(r) - cx(from));
    // Off-row/column targets must lie entirely beyond the current element (no diagonal jumps
    // from the end of a row into the row below).
    if (overlap <= 0 && gap < -1) continue;
    gap = Math.max(0, gap);
    // Elements sharing the row/column win decisively; otherwise weigh perpendicular drift heavily.
    const score = overlap > 0 ? gap + perp * 0.3 : 10_000 + gap + perp * 2;
    if (!best || score < best.score) best = { id: c.id, score };
  }
  return best?.id ?? null;
}
