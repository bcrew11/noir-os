import { create } from 'zustand';

/** A one-click question shown on the TV (e.g. "Open Spotify?"). */
export interface ConfirmPrompt {
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export const useConfirm = create<{ prompt: ConfirmPrompt | null }>(() => ({ prompt: null }));
export const askConfirm = (prompt: ConfirmPrompt) => useConfirm.setState({ prompt });
export const closeConfirm = () => useConfirm.setState({ prompt: null });
