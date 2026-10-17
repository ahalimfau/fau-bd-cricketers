// Player list for everyone; adding, renaming, photos and hiding are admin only
// (and enforced by firestore.rules, not just hidden here).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HERO_TITLES, titleName, type TitleKey } from '../engine/awards';
import { battingAverage, bestText, careers, economyText, highestText, oversText, performanceLine, performances, strikeRate } from '../engine/career';
import { canManage } from '../config/roles';
import { useApp, usePlayedMatches } from '../data/hooks';
import { deletePlayer, newId, savePlayer, writeErrorText } from '../data/repo';
import { cleanText, type Player } from '../data/validate';
import { ACCEPTED_INPUT, PhotoError, compressPhoto } from '../security/photo';
import { Avatar, Banner, Header, Loading, Page, Sheet, btn, fmtDate, pad } from '../ui/kit';
import { matchTitle } from '../ui/cricket';

function EditPlayer({ player, open, onClose }: { player: Player | 'new' | null; open: boolean; onClose: () => void }) {
  const isNew = player === 'new';
  const p = player && player !== 'new' ? player : null;
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(p?.name ?? '');
    setPhoto(p?.photo ?? null);
    setActive(p?.active ?? true);
    setError(null);
    setBusy(false);
    setConfirmDelete(false);
  }, [open, player]); // eslint-disable-line react-hooks/exhaustive-deps

  const clean = cleanText(name, 40);
  const save = () => {
    if (!clean) return;
    const id = p?.id ?? newId('players');
    savePlayer(id, { name: clean, active, photo }).catch((e) => setError(writeErrorText(e)));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'Add player' : 'Edit player'}>
      <div className="flex items-center gap-3.5">
        <div className="relative flex-none">
          <Avatar player={{ id: 'x', name: name || '?', photo: photo ?? undefined, active: true }} size={84} />
          <button
            type="button"
            aria-label="Change photo"
            onClick={() => fileRef.current?.click()}
            className="absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-green text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_INPUT}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              setError(null);
              try {
                setPhoto(await compressPhoto(f));
              } catch (err) {
                setError(err instanceof PhotoError ? err.message : "Couldn't use that photo.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-muted">
          Name
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-[50px] w-full rounded-xl border-2 border-line bg-white px-3 text-base font-bold text-ink focus:border-green focus:outline-none"
          />
        </label>
      </div>
      <p className="text-[13px] text-muted">
        Photos are cropped square, redrawn and shrunk to about 20 KB before saving, so nothing hidden in the original file (or its location data) is kept.
        {photo && (
          <>
            {' '}
            <button type="button" className="font-bold text-red-dark underline" onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          </>
        )}
      </p>
      {busy && <Banner tone="grey">Processing photo…</Banner>}
      {error && <Banner tone="red">{error}</Banner>}
      {!isNew && (
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
          <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="h-5 w-5 accent-green" />
          Hide from the team picker (left the group)
        </label>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
        <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btn.primary} disabled={!clean || busy} onClick={save}>
          Save
        </button>
      </div>
      {p &&
        (confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-red-tint p-3">
            <span className="text-sm font-semibold text-red-dark">
              Delete {p.name} for good? Old scorecards will show "Unknown" instead of the name. Hiding is usually better.
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl bg-red font-extrabold text-white"
                onClick={() => {
                  deletePlayer(p.id).catch((e) => setError(writeErrorText(e)));
                  onClose();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="min-h-11 text-sm font-bold text-red-dark underline" onClick={() => setConfirmDelete(true)}>
            Delete player
          </button>
        ))}
    </Sheet>
  );
}

export function Players() {
  const app = useApp();
  const navigate = useNavigate();
  const admin = canManage(app.auth.role);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const list = app.players.filter((p) => (admin || p.active) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sorted = [...list.filter((p) => p.active), ...list.filter((p) => !p.active)];

  return (
    <Page nav>
      <Header
        title={
          <>
            Players <span className="font-sans text-base font-bold text-muted">{app.players.filter((p) => p.active).length}</span>
          </>
        }
        sub={admin ? 'Tap a player to edit' : undefined}
        right={
          admin && (
            <button type="button" onClick={() => setEditing('new')} className="flex min-h-11 items-center rounded-full bg-green px-4 font-extrabold text-white">
              + Add
            </button>
          )
        }
      />
      <div className={`${pad} py-2`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="h-12 w-full rounded-xl border-[1.5px] border-line bg-surface px-3.5 text-base focus:border-green focus:outline-none"
        />
      </div>
      {!app.playersReady ? (
        <Loading />
      ) : (
        <div className={`grid flex-1 grid-cols-[repeat(auto-fill,minmax(72px,1fr))] content-start gap-x-2 gap-y-3.5 ${pad} pt-1 pb-4`}>
          {sorted.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => (admin ? setEditing(p) : navigate(`/players/${p.id}`))}
              className={`flex min-w-0 flex-col items-center gap-1 ${p.active ? '' : 'opacity-45'}`}
            >
              <Avatar player={p} size={60} tone="A" />
              <span className="max-w-full truncate text-[13px] font-bold">{p.name}</span>
              {!p.active && <span className="text-[11px] text-muted">hidden</span>}
            </button>
          ))}
          {sorted.length === 0 && <p className="col-span-full text-muted">{admin ? 'No players yet. Tap + Add.' : 'No players yet.'}</p>}
        </div>
      )}
      <EditPlayer player={editing} open={editing !== null} onClose={() => setEditing(null)} />
    </Page>
  );
}

export function PlayerProfile() {
  const { id } = useParams();
  const app = useApp();
  const { list, ready } = usePlayedMatches();
  const [editing, setEditing] = useState(false);
  const p = id ? app.byId.get(id) : undefined;
  const data = useMemo(() => {
    if (!id) return null;
    const career = careers(list).get(id) ?? null;
    const perf = performances(list, id, app.cfg);
    const counts = new Map<TitleKey, number>();
    for (const x of perf) for (const t of x.titles) counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
    return { career, perf, titles: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
  }, [list, id, app.cfg]);

  if (!app.playersReady) return <Page><Loading /></Page>;
  if (!p || !id) {
    return (
      <Page>
        <Header title="Player" back="/players" />
        <p className={`${pad} py-6`}>Player not found.</p>
      </Page>
    );
  }
  const c = data?.career;
  const stat = (label: string, v: string | number, shame?: boolean) => (
    <div className={`flex min-w-0 flex-col rounded-2xl px-3 py-2.5 ${shame ? 'bg-red-tint' : 'bg-surface'}`}>
      <span className={`truncate font-display text-2xl font-extrabold ${shame ? 'text-red-dark' : ''}`}>{v}</span>
      <span className="truncate text-xs text-muted">{label}</span>
    </div>
  );
  const H2 = 'pt-1 text-xs font-extrabold tracking-widest text-muted';
  return (
    <Page>
      <Header
        title={p.name}
        back="/players"
        right={
          canManage(app.auth.role) && (
            <button type="button" className={btn.ghost} onClick={() => setEditing(true)}>
              Edit
            </button>
          )
        }
      />
      <div className={`flex flex-col gap-3 ${pad} pt-2 pb-8`}>
        <div className="flex items-center gap-4">
          <Avatar player={p} size={88} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-2xl font-extrabold">{p.name}</span>
            <span className="text-sm text-muted">
              {!ready ? 'Loading…' : c ? `${c.matches} finished ${c.matches === 1 ? 'match' : 'matches'}` : 'No finished matches yet'}
            </span>
          </div>
        </div>
        {data && data.titles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.titles.map(([key, n]) => (
              <span key={key} className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${HERO_TITLES.has(key) ? 'bg-green-tint text-green-dark' : 'bg-red-tint text-red-dark'}`}>
                {app.cfg.titles[key].label} ×{n}
              </span>
            ))}
          </div>
        )}
        {c && (
          <>
            <h2 className={H2}>BATTING</h2>
            <div className="grid grid-cols-3 gap-2">
              {stat('Runs', c.runs)}
              {stat('Innings', c.innings)}
              {stat('Highest', highestText(c))}
              {stat('Average', battingAverage(c))}
              {stat('Strike rate', strikeRate(c))}
              {stat('Not outs', c.notOuts)}
              {stat('Fours', c.fours)}
              {stat('Sixes', c.sixes)}
              {stat('Ducks', c.ducks, c.ducks > 0)}
            </div>
            <h2 className={H2}>BOWLING</h2>
            <div className="grid grid-cols-3 gap-2">
              {stat('Wickets', c.wickets)}
              {stat('Overs', oversText(c.bowlBalls))}
              {stat('Best', bestText(c))}
              {stat('Economy', economyText(c))}
              {stat('Runs given', c.bowlRuns)}
              {stat('Maidens', c.maidens)}
              {stat('Wides', c.wides, c.wides > 0)}
              {stat('No-balls', c.noBalls, c.noBalls > 0)}
            </div>
            <h2 className={H2}>FIELDING</h2>
            <div className="grid grid-cols-3 gap-2">
              {stat('Catches', c.catches)}
              {stat('Run-outs', c.runOuts + c.stumpings)}
              {stat('Drops', c.drops, c.drops > 0)}
              {stat('Leaked 4s/6s', c.boundariesLeaked, c.boundariesLeaked > 0)}
              {stat('Missed run-outs', c.missedRunOuts, c.missedRunOuts > 0)}
              {stat('Overthrows', c.overthrows, c.overthrows > 0)}
            </div>
          </>
        )}
        {data && data.perf.length > 0 && (
          <>
            <h2 className={H2}>MATCH BY MATCH</h2>
            <div className="flex flex-col gap-2">
              {data.perf.map(({ match, team, stats, titles }) => {
                const result = match.state.result?.text ?? '';
                const won = match.state.result?.winner === team;
                return (
                  <Link key={match.id} to={`/match/${match.id}/scorecard`} className="flex flex-col gap-1 rounded-2xl bg-surface px-3.5 py-2.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold">
                        {matchTitle(match.meta)}
                        {match.meta[team === 'A' ? 'teamA' : 'teamB'].playerIds[0] === id ? ' · captain' : ''}
                      </span>
                      <span className="flex-none text-xs text-muted">{fmtDate(match.createdAt)}</span>
                    </span>
                    <span className="font-display text-lg font-extrabold">{performanceLine(stats)}</span>
                    <span className={`text-xs font-semibold ${won ? 'text-green-dark' : 'text-muted'}`}>{result}</span>
                    {titles.length > 0 && (
                      <span className="flex flex-wrap gap-1.5 pt-0.5">
                        {titles.map((t) => (
                          <span key={t.key} className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${HERO_TITLES.has(t.key) ? 'bg-green-tint text-green-dark' : 'bg-red-tint text-red-dark'}`}>
                            {titleName(t.key, t.label)}
                          </span>
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <Link to="/stats" className={btn.outline}>
            Season stats
          </Link>
          <Link to="/shame" className={btn.outline}>
            Hall of Shame
          </Link>
        </div>
      </div>
      <EditPlayer player={editing ? p : null} open={editing} onClose={() => setEditing(false)} />
    </Page>
  );
}
