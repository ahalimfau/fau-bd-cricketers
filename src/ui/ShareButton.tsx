import { useState, type RefObject } from 'react';
import { shareNode } from './share';

export function ShareButton({ target, fileName, text, label = 'Share', className }: { target: RefObject<HTMLElement | null>; fileName: string; text: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span data-noshare="true" className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        className={className ?? 'flex min-h-11 items-center rounded-xl bg-green-tint px-3.5 text-sm font-extrabold text-green-dark disabled:opacity-50'}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await shareNode(target.current, fileName, text);
            if (r === 'downloaded') setMsg('Picture saved. Send it from your photos or downloads.');
          } catch {
            setMsg("Couldn't share. Take a screenshot instead.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Making picture…' : label}
      </button>
      {msg && <span className="mt-1 max-w-60 text-right text-xs text-muted">{msg}</span>}
    </span>
  );
}
