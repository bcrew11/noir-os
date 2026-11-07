import { Check, ChevronDown, Copy, KeyRound, Loader2, Share } from 'lucide-react';
import { useState } from 'react';
import { api, pushToast } from '@noir/ui';
import { Btn, Card, cx, haptic } from './ui.tsx';

/**
 * Guided setup for the iPhone Shortcut that saves links from the share sheet anywhere and sends
 * them to the TV when you get home (see docs/IPHONE_SHORTCUT.md). The values the user has to type
 * into Shortcuts — the TV's address and a key — are shown here with copy buttons.
 */
function copy(text: string) {
  // The stick serves over plain http, where the async Clipboard API isn't available; the classic
  // select-and-copy route still works inside a tap.
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy failed');
    haptic(10);
    pushToast({ tone: 'success', title: 'Copied' });
  } catch { pushToast({ tone: 'warning', title: 'Couldn’t copy — press and hold the text to copy it' }); }
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-black/25 py-1.5 pl-3 pr-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[0.7rem] uppercase tracking-[0.12em] text-fg-dim">{label}</div>
        <div className="select-all break-all font-mono text-[0.8rem] text-fg">{value}</div>
      </div>
      <button type="button" aria-label={`Copy ${label}`} onClick={() => copy(value)} className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted active:bg-white/10"><Copy className="size-4" /></button>
    </div>
  );
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/35 text-[0.75rem] font-semibold">{n}</span>
    <div className="min-w-0 flex-1 space-y-2 text-[0.86rem] leading-relaxed text-fg-muted">{children}</div>
  </li>
);
const B = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-fg">{children}</span>;

export function ShortcutSetup() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `${location.origin}/api/saved`;

  const makeKey = async () => {
    setBusy(true);
    try { setKey((await api<{ token: string }>('/api/phones/key', { body: { name: 'iPhone Shortcut' } })).token); haptic(12); }
    catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mt-5 !p-0">
      <button type="button" onClick={() => { haptic(); setOpen(!open); }} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/25"><Share className="size-5 text-highlight" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.98rem] text-fg">Save from anywhere</div>
          <div className="text-[0.8rem] text-fg-muted">An iPhone Shortcut on the share sheet. Works away from home; syncs when you’re back.</div>
        </div>
        <ChevronDown className={cx('size-5 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="space-y-5 border-t border-line px-4 pb-5 pt-4">
          <Step n={1}>
            <p>Create a key for the Shortcut (it appears under paired devices; remove it there to revoke it).</p>
            {key ? (
              <div className="space-y-2">
                <Value label="TV address (URL)" value={endpoint} />
                <Value label="Authorization header" value={`Bearer ${key}`} />
                <p className="flex items-center gap-1.5 text-[0.78rem] text-emerald-200"><Check className="size-4" />Keep this page open while you build the Shortcuts — the key is only shown once.</p>
              </div>
            ) : (
              <Btn variant="primary" className="w-full" disabled={busy} onClick={() => void makeKey()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Create Shortcut key
              </Btn>
            )}
          </Step>
          <Step n={2}>
            <p>In the <B>Shortcuts</B> app, tap <B>+</B> and name it <B>Sync NOIR Saved</B>. Add these actions:</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li><B>Get File from Folder</B> → folder <B>Shortcuts</B>, path <B>NOIR Saved.txt</B>. Expand it and turn <B>Error If Not Found</B> off.</li>
              <li><B>If</B> <i>File</i> <B>has any value</B>, then inside the If:</li>
              <li className="ml-3"><B>Get Contents of URL</B> → paste the <B>TV address</B>. Expand: Method <B>POST</B>; Headers: add <B>Authorization</B> with the <B>Authorization header</B> value; Request Body <B>JSON</B> with a Text field named <B>text</B> set to the <i>File</i> variable.</li>
              <li className="ml-3"><B>Delete Files</B> → <i>File</i>, with <B>Confirm Before Deleting</B> off.</li>
            </ul>
            <p className="text-[0.78rem]">If the TV can’t be reached, the request fails before the delete, so nothing is lost.</p>
          </Step>
          <Step n={3}>
            <p>New shortcut <B>Save to NOIR</B>. Tap the <B>ⓘ</B> (or settings) and turn on <B>Show in Share Sheet</B>; set it to receive <B>URLs</B>, <B>Safari web pages</B> and <B>Text</B>, and if there’s no input, <B>Get Clipboard</B>. Add:</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li><B>Get URLs from Input</B> → <i>Shortcut Input</i>.</li>
              <li><B>Append to Text File</B> → append <i>URLs</i> to folder <B>Shortcuts</B>, file <B>NOIR Saved.txt</B> (Make New Line on).</li>
              <li><B>Get Network Details</B> → <B>Wi‑Fi</B>, <B>Network Name</B>.</li>
              <li><B>If</B> <i>Network Details</i> <B>is</B> your home Wi‑Fi name: <B>Run Shortcut</B> → <B>Sync NOIR Saved</B>.</li>
              <li><B>Show Notification</B> → “Saved to NOIR”.</li>
            </ul>
          </Step>
          <Step n={4}>
            <p>Sync when you get home: <B>Automation</B> tab → <B>+</B> → <B>Wi‑Fi</B> → choose your home network → <B>Run Immediately</B> → action <B>Run Shortcut</B> → <B>Sync NOIR Saved</B>.</p>
          </Step>
          <Step n={5}>
            <p>Try it: in YouTube or Netflix tap <B>Share</B> → <B>Save to NOIR</B> (scroll the app row or tap <B>More</B> the first time). The first run asks to allow access to the TV on your network — tap <B>Allow</B>.</p>
          </Step>
        </ol>
      )}
    </Card>
  );
}
