import { AnimatePresence } from 'motion/react';
import { Smartphone } from 'lucide-react';
import { api, useNoir, useNow } from '@noir/ui';
import { Dialog } from './Dialog.tsx';
import { FButton } from './primitives.tsx';

/** Shown on the TV when a phone asks to pair. The code proves the phone can see this screen. */
export function PhonePairingOverlay() {
  const req = useNoir((s) => s.phonePairing);
  useNow(1000);
  const open = req && req.expiresAt > Date.now();
  return (
    <AnimatePresence>
      {open && (
        <Dialog key={req.code} onClose={() => void api('/api/phone/pair/deny', { method: 'POST', body: {} })} width="w-[46rem]">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-20 place-items-center rounded-3xl bg-primary/20"><Smartphone className="size-10 text-highlight" strokeWidth={1.6} /></div>
            <h2 className="mt-6 text-[2.2rem] font-semibold">Pair “{req.deviceName}”?</h2>
            <p className="mt-2 text-[1.2rem] text-fg-muted">Enter this code on your phone to let it control NOIR.</p>
            <div className="mt-8 flex gap-3">
              {req.code.split('').map((d, i) => (
                <span key={i} className="grid h-24 w-18 place-items-center rounded-2xl border border-line-strong bg-white/[0.06] text-[3.4rem] font-semibold tabular-nums">{d}</span>
              ))}
            </div>
            <p className="mt-6 text-[1rem] text-fg-dim">Expires in {Math.max(0, Math.ceil((req.expiresAt - Date.now()) / 1000))}s</p>
            <FButton id="pair-deny" className="mt-6" label="Don’t allow" autoFocus onSelect={() => void api('/api/phone/pair/deny', { method: 'POST', body: {} })} />
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
