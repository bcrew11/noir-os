import { create } from 'zustand';
import { rememberScreen } from '../focus/focus.ts';

export type Screen = 'home' | 'apps' | 'music' | 'inputs' | 'saved' | 'ambient' | 'settings';
export const SCREENS: Screen[] = ['home', 'apps', 'music', 'inputs', 'saved', 'ambient', 'settings'];

interface UIState {
  screen: Screen;
  previous: Screen;
  /** Increments on every navigation so transitions know direction/continuity. */
  navCount: number;
  lastActivity: number;
  remoteSimulator: boolean;
  settingsSection: string;
  /** Another app is in front: the interface is unmounted to free the stick's memory and CPU. */
  asleep: boolean;
  go: (s: Screen) => void;
}

export const useUI = create<UIState>((set, get) => ({
  screen: 'home',
  previous: 'home',
  navCount: 0,
  lastActivity: Date.now(),
  remoteSimulator: false,
  settingsSection: 'appearance',
  asleep: false,
  go: (s) => {
    const cur = get().screen;
    if (s === cur) return;
    rememberScreen(cur);
    set({ screen: s, previous: cur, navCount: get().navCount + 1 });
  },
}));

/** Back handlers form a stack: dialogs push one while open; the topmost handles Back. */
type BackHandler = () => boolean | void;
const backStack: BackHandler[] = [];
export function pushBack(fn: BackHandler) {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}
export function handleBack(): boolean {
  for (let i = backStack.length - 1; i >= 0; i--) {
    if (backStack[i]!() !== false) return true;
  }
  return false;
}

export const markActivity = () => useUI.setState({ lastActivity: Date.now() });
