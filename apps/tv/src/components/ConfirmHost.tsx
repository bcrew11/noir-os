import { AnimatePresence } from 'motion/react';
import { closeConfirm, useConfirm } from '../store/confirm.ts';
import { Dialog } from './Dialog.tsx';
import { FButton } from './primitives.tsx';

/** Renders the current one-click confirmation; the main action is focused, so OK confirms. */
export function ConfirmHost() {
  const prompt = useConfirm((s) => s.prompt);
  return (
    <AnimatePresence>
      {prompt && (
        <Dialog key={prompt.title} title={prompt.title} subtitle={prompt.body} onClose={closeConfirm} width="w-[40rem]">
          <div className="flex gap-3">
            <FButton id="confirm-yes" variant="primary" className="flex-1" label={prompt.confirmLabel} autoFocus
              onSelect={() => { const p = prompt; closeConfirm(); p.onConfirm(); }} />
            <FButton id="confirm-no" label="Not now" onSelect={closeConfirm} />
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
