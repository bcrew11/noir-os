import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { create } from 'zustand';
import { pickBest, type Direction } from './geometry.ts';

/**
 * Remote-first spatial focus engine.
 *
 * - Every interactive element registers with an id, the scope it lives in (page or dialog)
 *   and an optional group (e.g. "apps", "nav").
 * - Only the top scope on the stack is navigable, which traps focus inside dialogs.
 * - Entering a group restores the element last focused in it (or a preferred element).
 * - Screens remember their last focus so returning to them feels continuous.
 */
interface Node {
  id: string;
  el: HTMLElement;
  scope: string;
  group?: string;
  disabled?: boolean;
  onSelect?: () => void;
  onLongSelect?: () => void;
  /** 'start' pins the element's row to the top of its scroll area (e.g. the App Library grid). */
  scrollAlign?: 'nearest' | 'start';
}

interface FocusState {
  focusedId: string | null;
  scopes: string[];
}

export const useFocusStore = create<FocusState>(() => ({ focusedId: null, scopes: ['page'] }));

const nodes = new Map<string, Node>();
const groupMemory = new Map<string, string>();
const groupPreferred = new Map<string, () => string | undefined>();
const scopeMemory = new Map<string, string>();

const activeScope = () => {
  const s = useFocusStore.getState().scopes;
  return s[s.length - 1]!;
};

const lowPerf = () => document.documentElement.classList.contains('low-perf');

/**
 * Where each smooth-scrolling container is heading. While a scroll animation runs, elements are
 * temporarily somewhere else on screen (e.g. the last App Library row passes under the floating
 * nav bar). Spatial navigation uses the *destination* layout, so quick presses or a held D-pad
 * button behave exactly like slow ones.
 */
const scrollTargets = new Map<HTMLElement, { top: number; left: number }>();

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) return p;
  }
  return null;
}

/** Element rect as it will be once any pending scroll in its container has finished. */
function settledRect(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  const parent = scrollParent(el);
  const t = parent && scrollTargets.get(parent);
  if (!parent || !t) return r;
  const dx = parent.scrollLeft - t.left;
  const dy = parent.scrollTop - t.top;
  return new DOMRect(r.left + dx, r.top + dy, r.width, r.height);
}

function scrollIntoView(el: HTMLElement, align: 'nearest' | 'start' = 'nearest') {
  const reduced = document.documentElement.dataset.motion !== 'full' || lowPerf();
  const parent = scrollParent(el);
  if (!parent) {
    el.scrollIntoView({ block: align, inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  // Compute the destination ourselves (honouring scroll-padding) so navigation can use it.
  const cs = getComputedStyle(parent);
  const padT = parseFloat(cs.scrollPaddingTop) || 0, padB = parseFloat(cs.scrollPaddingBottom) || 0;
  const padL = parseFloat(cs.scrollPaddingLeft) || 0, padR = parseFloat(cs.scrollPaddingRight) || 0;
  const pr = parent.getBoundingClientRect();
  const r = settledRect(el);
  const base = scrollTargets.get(parent) ?? { top: parent.scrollTop, left: parent.scrollLeft };
  // Element position in the container's scroll coordinates, at the destination scroll offset.
  const top = r.top - pr.top + base.top, bottom = top + r.height;
  const left = r.left - pr.left + base.left, right = left + r.width;
  let y = base.top, x = base.left;
  if (align === 'start') y = top - padT;
  else if (top - padT < y) y = top - padT;
  else if (bottom + padB > y + parent.clientHeight) y = bottom + padB - parent.clientHeight;
  if (left - padL < x) x = left - padL;
  else if (right + padR > x + parent.clientWidth) x = right + padR - parent.clientWidth;
  y = Math.max(0, Math.min(y, parent.scrollHeight - parent.clientHeight));
  x = Math.max(0, Math.min(x, parent.scrollWidth - parent.clientWidth));
  if (y === parent.scrollTop && x === parent.scrollLeft && !scrollTargets.has(parent)) return;
  if (reduced) {
    scrollTargets.delete(parent);
    parent.scrollTo({ top: y, left: x, behavior: 'auto' });
    return;
  }
  scrollTargets.set(parent, { top: y, left: x });
  parent.scrollTo({ top: y, left: x, behavior: 'smooth' });
  const done = () => { if (scrollTargets.get(parent)?.top === y && scrollTargets.get(parent)?.left === x) scrollTargets.delete(parent); };
  parent.addEventListener('scrollend', done, { once: true });
  setTimeout(done, 900); // fallback where scrollend isn't supported
}

export function focus(id: string | null | undefined, opts: { scroll?: boolean } = {}) {
  if (!id) return false;
  const n = nodes.get(id);
  if (!n || n.disabled || n.scope !== activeScope()) return false;
  useFocusStore.setState({ focusedId: id });
  if (n.group) groupMemory.set(`${n.scope}:${n.group}`, id);
  scopeMemory.set(n.scope, id);
  if (opts.scroll !== false) scrollIntoView(n.el, n.scrollAlign);
  // Parallax hint for the background (normalised -1..1). Writing a variable on <html> restyles the
  // whole page, so skip it whenever parallax is off (reduced motion / streaming sticks).
  if (lowPerf() || document.documentElement.dataset.motion !== 'full') return true;
  const r = n.el.getBoundingClientRect();
  document.documentElement.style.setProperty('--focus-x', String(((r.left + r.width / 2) / window.innerWidth) * 2 - 1));
  document.documentElement.style.setProperty('--focus-y', String(((r.top + r.height / 2) / window.innerHeight) * 2 - 1));
  return true;
}

function navigable(scope = activeScope()) {
  return [...nodes.values()].filter((n) => n.scope === scope && !n.disabled && n.el.isConnected && n.el.offsetParent !== null);
}

export function firstIn(scope = activeScope()): string | undefined {
  const list = navigable(scope).map((n) => ({ n, r: settledRect(n.el) }));
  list.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  return list[0]?.n.id;
}

export function move(dir: Direction): boolean {
  const scope = activeScope();
  const { focusedId } = useFocusStore.getState();
  const cur = focusedId ? nodes.get(focusedId) : undefined;
  if (!cur || cur.scope !== scope || !cur.el.isConnected) return focus(scopeMemory.get(scope) ?? firstIn(scope));
  const candidates = navigable(scope).filter((n) => n.id !== cur.id);
  const bestId = pickBest(settledRect(cur.el), candidates.map((n) => ({ id: n.id, rect: settledRect(n.el) })), dir);
  if (!bestId) return false;
  const best = nodes.get(bestId)!;
  if (best.group && best.group !== cur.group) {
    const preferred = groupPreferred.get(best.group)?.() ?? groupMemory.get(`${scope}:${best.group}`);
    if (preferred && preferred !== bestId && nodes.get(preferred)?.scope === scope && focus(preferred)) return true;
  }
  return focus(bestId);
}

export function select(long = false): boolean {
  const { focusedId } = useFocusStore.getState();
  const n = focusedId ? nodes.get(focusedId) : undefined;
  if (!n || n.disabled || n.scope !== activeScope()) return false;
  if (long && n.onLongSelect) n.onLongSelect();
  else n.onSelect?.();
  return true;
}

export function hasLongSelect(): boolean {
  const id = useFocusStore.getState().focusedId;
  return !!(id && nodes.get(id)?.onLongSelect);
}

export function pushScope(scope: string) {
  useFocusStore.setState((s) => ({ scopes: [...s.scopes.filter((x) => x !== scope), scope] }));
  // Move focus into the new scope unless an element inside it already claimed focus (autoFocus).
  const settle = (attempt: number) => {
    const id = useFocusStore.getState().focusedId;
    if (id && nodes.get(id)?.scope === scope) return;
    if (!focus(firstIn(scope)) && attempt < 10) requestAnimationFrame(() => settle(attempt + 1));
  };
  requestAnimationFrame(() => requestAnimationFrame(() => settle(0)));
}

export function popScope(scope: string) {
  useFocusStore.setState((s) => ({ scopes: s.scopes.filter((x) => x !== scope) }));
  const top = activeScope();
  requestAnimationFrame(() => focus(scopeMemory.get(top) ?? firstIn(top)));
}

export function setGroupPreferred(group: string, fn: () => string | undefined) {
  groupPreferred.set(group, fn);
  return () => groupPreferred.delete(group);
}

/** Remember/restore focus per screen. */
const screenMemory = new Map<string, string>();
export function rememberScreen(screen: string) {
  const id = useFocusStore.getState().focusedId;
  if (id && nodes.get(id)?.scope === 'page') screenMemory.set(screen, id);
}
export function restoreScreen(screen: string, fallback?: string) {
  const tryFocus = (attempt: number) => {
    if (focus(screenMemory.get(screen), { scroll: true }) || focus(fallback) || (attempt > 3 && focus(firstIn()))) return;
    if (attempt < 12) requestAnimationFrame(() => tryFocus(attempt + 1));
  };
  requestAnimationFrame(() => tryFocus(0));
}

export const ScopeContext = createContext('page');

export interface FocusableOptions {
  group?: string;
  disabled?: boolean;
  onSelect?: () => void;
  onLongSelect?: () => void;
  autoFocus?: boolean;
  scrollAlign?: 'nearest' | 'start';
}

/** Register an element with the focus engine. Returns a ref and whether it is focused. */
export function useFocusable<T extends HTMLElement = HTMLDivElement>(id: string, opts: FocusableOptions = {}) {
  const ref = useRef<T>(null);
  const scope = useContext(ScopeContext);
  const latest = useRef(opts);
  latest.current = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    nodes.set(id, {
      id, el, scope,
      get group() { return latest.current.group; },
      get disabled() { return latest.current.disabled; },
      get scrollAlign() { return latest.current.scrollAlign; },
      onSelect: () => latest.current.onSelect?.(),
      get onLongSelect() { return latest.current.onLongSelect; },
    } as Node);
    return () => {
      if (nodes.get(id)?.el === el) nodes.delete(id);
    };
  }, [id, scope]);

  useEffect(() => {
    if (opts.autoFocus) requestAnimationFrame(() => focus(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focused = useFocusStore((s) => s.focusedId === id);
  const pointer = {
    onMouseEnter: () => focus(id, { scroll: false }),
    onClick: () => { focus(id, { scroll: false }); select(); },
  };
  return { ref, focused, pointer };
}

/** Test/debug helper. */
export function _registeredIds() {
  return [...nodes.keys()];
}
