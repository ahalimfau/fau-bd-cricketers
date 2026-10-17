// Shared building blocks. Every screen is one fluid column (max 560px),
// touch targets are at least 44px, and colours come from the theme tokens in
// index.css (white, green, red).

import { useEffect, useId, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { Player } from '../data/validate';

export const pad = 'px-[clamp(12px,4vw,20px)]';

export const btn = {
  primary:
    'min-h-14 w-full rounded-2xl bg-green px-4 text-[17px] font-extrabold text-white flex items-center justify-center gap-2 active:bg-green-dark disabled:opacity-40',
  outline:
    'min-h-12 rounded-xl border-2 border-green bg-white px-3 font-bold text-green-dark flex items-center justify-center gap-2 active:bg-green-tint disabled:opacity-40',
  ghost:
    'min-h-12 rounded-xl border-[1.5px] border-line bg-white px-3 font-bold text-ink flex items-center justify-center gap-2 active:bg-surface disabled:opacity-40',
  danger:
    'min-h-12 rounded-xl border-2 border-red bg-white px-3 font-bold text-red-dark flex items-center justify-center gap-2 active:bg-red-tint disabled:opacity-40',
};

export function Page({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-white text-ink">
      {children}
      {nav && <BottomNav />}
    </div>
  );
}

export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate();
  const cls =
    'flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface text-ink active:bg-line';
  const icon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
  if (to) {
    return (
      <Link to={to} aria-label="Back" className={cls}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" aria-label="Back" className={cls} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
      {icon}
    </button>
  );
}

export function Header({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string | true; right?: ReactNode }) {
  return (
    <header className={`flex items-center gap-2.5 ${pad} pt-3 pb-1.5`}>
      {back && <BackButton to={back === true ? undefined : back} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-display text-[22px] leading-tight font-extrabold">{title}</h1>
        {sub && <span className="truncate text-[13px] text-muted">{sub}</span>}
      </div>
      {right}
    </header>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export type Tone = 'A' | 'B' | 'N';

const toneCls: Record<Tone, string> = {
  A: 'bg-green-tint text-green-dark',
  B: 'bg-red-tint text-red-dark',
  N: 'bg-surface text-muted',
};

export function Avatar({ player, name, size = 44, tone = 'A', ring }: { player?: Player; name?: string; size?: number; tone?: Tone; ring?: string }) {
  const label = player?.name ?? name ?? '?';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.32) };
  const ringCls = ring ?? '';
  if (player?.photo) {
    return <img src={player.photo} alt="" width={size} height={size} style={style} className={`flex-none rounded-full object-cover ${ringCls}`} />;
  }
  return (
    <span style={style} className={`flex flex-none items-center justify-center rounded-full font-extrabold ${toneCls[tone]} ${ringCls}`} aria-hidden="true">
      {initials(label)}
    </span>
  );
}

/** Bottom sheet: slides over the screen, capped at 90% of the height, scrolls inside. */
export function Sheet({ open, onClose, title, children, tone }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tone?: 'red' }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? id : undefined}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-[clamp(14px,5vw,24px)] pt-2.5 pb-[max(18px,env(safe-area-inset-bottom))]"
      >
        <div className="h-1.5 w-10 flex-none self-center rounded-full bg-line" />
        {title && (
          <h2 id={id} className={`font-display text-[clamp(20px,6vw,24px)] leading-tight font-extrabold ${tone === 'red' ? 'text-red-dark' : ''}`}>
            {title}
          </h2>
        )}
        {children}
      </section>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-semibold text-muted">{children}</span>;
}

/** Grid of player faces to pick one from. */
export function PlayerPick({
  players,
  selected,
  onPick,
  tone = 'A',
  disabled,
  note,
}: {
  players: Player[];
  selected?: string;
  onPick: (id: string) => void;
  tone?: Tone;
  disabled?: (id: string) => boolean;
  note?: (id: string) => ReactNode;
}) {
  if (players.length === 0) return <p className="text-sm text-muted">Nobody available.</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-x-1.5 gap-y-3">
      {players.map((p) => {
        const on = p.id === selected;
        const off = disabled?.(p.id) ?? false;
        return (
          <button
            key={p.id}
            type="button"
            disabled={off}
            aria-pressed={on}
            onClick={() => onPick(p.id)}
            className="flex min-h-[76px] min-w-0 flex-col items-center gap-1 bg-transparent disabled:opacity-35"
          >
            <Avatar player={p} size={48} tone={tone} ring={on ? `ring-[3px] ring-offset-2 ${tone === 'B' ? 'ring-red' : 'ring-green'}` : ''} />
            <span className={`max-w-full truncate text-xs ${on ? 'font-extrabold' : 'font-semibold'}`}>{p.name}</span>
            {note && <span className="max-w-full truncate text-[11px] text-muted">{note(p.id)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Row of option buttons where one is selected. */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  cols,
  tone = 'green',
}: {
  options: { value: T; label: ReactNode; sub?: ReactNode; disabled?: boolean }[];
  value: T | undefined;
  onChange: (v: T) => void;
  cols?: number;
  tone?: 'green' | 'red';
}) {
  const onCls = tone === 'red' ? 'border-red bg-red text-white' : 'border-green bg-green text-white';
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={o.disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-12 flex-col items-center justify-center rounded-xl border-[1.5px] px-1.5 text-[15px] font-bold leading-tight disabled:opacity-35 ${
            o.value === value ? onCls : 'border-line bg-white text-ink'
          }`}
        >
          {o.label}
          {o.sub && <span className={`text-[11px] font-semibold ${o.value === value ? 'text-white/90' : 'text-muted'}`}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Banner({ tone = 'green', children }: { tone?: 'green' | 'red' | 'grey'; children: ReactNode }) {
  const cls = tone === 'red' ? 'bg-red-tint text-red-dark' : tone === 'grey' ? 'bg-surface text-ink' : 'bg-green-tint text-green-dark';
  return <div className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${cls}`}>{children}</div>;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <p className={`${pad} py-10 text-center text-muted`}>{text}</p>;
}

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-extrabold text-green' : 'font-semibold text-muted'}`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))]">
      <NavItem to="/" end label="Home" icon={<svg {...svg}><path d="M3 11l9-8 9 8v10H3z" /></svg>} />
      <NavItem to="/matches" label="Matches" icon={<svg {...svg}><path d="M4 6h16M4 12h16M4 18h10" /></svg>} />
      <NavItem to="/players" label="Players" icon={<svg {...svg}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5" /></svg>} />
      <NavItem to="/shame" label="Shame" icon={<svg {...svg}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>} />
    </nav>
  );
}

/** Colours for a ball in the over chips. */
export function chipCls(b: { label: string; isBoundary: boolean; isWicket: boolean; extraType?: string }): string {
  if (b.isWicket) return 'bg-red text-white border-red';
  if (b.isBoundary) return 'bg-green text-white border-green';
  if (b.extraType === 'wd' || b.extraType === 'nb') return 'bg-white text-red-dark border-red';
  return 'bg-white text-ink border-line';
}

export function fmtDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
