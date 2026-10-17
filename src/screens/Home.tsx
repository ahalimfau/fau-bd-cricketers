import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { replay } from '../engine/replay';
import { HERO_TITLES, computeAwards } from '../engine/awards';
import { canManage, canScore } from '../config/roles';
import { useApp, useMatches } from '../data/hooks';
import type { MatchDoc } from '../data/validate';
import { Avatar, Loading, Page, fmtDate, pad } from '../ui/kit';
import { matchTitle, scoreText, situation, teamName } from '../ui/cricket';

export function LiveCard({ m, canScoreIt }: { m: MatchDoc; canScoreIt: boolean }) {
  const s = useMemo(() => replay(m.meta, m.clean.events), [m]);
  const [i1, i2] = s.innings;
  const cur = s.innings[s.current - 1];
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-line bg-white p-4 shadow-[0_2px_10px_rgba(16,35,26,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red px-2.5 py-1 text-xs font-extrabold tracking-wider text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
        <span className="text-[13px] text-muted">
          {s.current === 2 ? '2nd' : '1st'} innings · {m.meta.oversPerInnings} overs
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[i1, i2]
          .filter((inn) => inn.started || inn === cur)
          .map((inn) => {
            const now = inn === cur;
            return (
              <div key={inn.number} className="flex items-baseline justify-between gap-2">
                <span className={now ? 'text-lg font-extrabold' : 'text-base text-muted'}>{teamName(m.meta, inn.battingTeam)}</span>
                <span className={`font-display ${now ? 'text-[clamp(28px,9vw,36px)] leading-none font-extrabold' : 'text-lg font-semibold text-muted'}`}>
                  {scoreText(inn)} <span className="text-base font-semibold text-muted">({inn.overs})</span>
                </span>
              </div>
            );
          })}
      </div>
      <div className="text-[15px] font-bold text-green-dark">{situation(m.meta, s)}</div>
      <div className={`grid gap-2.5 ${canScoreIt ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Link to={`/match/${m.id}`} className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-green text-center font-extrabold text-green-dark">
          Watch live
        </Link>
        {canScoreIt && (
          <Link to={`/score/${m.id}`} className="flex min-h-12 items-center justify-center rounded-2xl bg-green text-center font-extrabold text-white">
            Keep scoring
          </Link>
        )}
      </div>
    </section>
  );
}

export function resultLine(m: MatchDoc): string {
  const s = replay(m.meta, m.clean.events);
  return s.result?.text ?? (m.status === 'live' ? 'In progress' : 'Unfinished');
}

export function Home() {
  const app = useApp();
  const { matches, ready, error } = useMatches(60);
  const live = matches.filter((m) => m.status === 'live');
  const done = matches.filter((m) => m.status === 'done');
  const latest = done[0];
  const shame = useMemo(() => {
    if (!latest) return [];
    return computeAwards(replay(latest.meta, latest.clean.events), app.cfg);
  }, [latest, app.cfg]);
  const role = app.auth.role;

  return (
    <Page nav>
      <header className={`flex items-center justify-between gap-3 ${pad} pt-4 pb-2.5`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[clamp(22px,7vw,28px)] leading-none font-extrabold tracking-tight">
            <span className="text-green">FAU BD</span> Cricketers
          </span>
          <span className="text-[13px] text-muted">{app.players.filter((p) => p.active).length} players</span>
        </div>
        <div className="flex flex-none items-center gap-2">
          {canManage(role) && (
            <Link to="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          )}
          <Link to="/login" className="flex min-h-11 items-center gap-1.5 rounded-full bg-green-tint px-3 text-sm font-bold text-green-dark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            {role === 'admin' ? 'Admin' : role === 'scorer' ? 'Scorer' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className={`flex flex-1 flex-col gap-4 ${pad} pt-1 pb-4`}>
        {!ready && <Loading />}
        {error && <p className="text-sm text-red-dark">Couldn't load matches ({error}).</p>}
        {live.map((m) => (
          <LiveCard key={m.id} m={m} canScoreIt={canScore(role)} />
        ))}

        {canScore(role) ? (
          <Link
            to="/new"
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-green bg-surface text-[17px] font-extrabold text-green-dark"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New match
          </Link>
        ) : (
          ready &&
          live.length === 0 && (
            <div className="rounded-2xl bg-surface p-4 text-sm text-muted">
              No match is live right now. Scorers: <Link to="/login" className="font-bold text-green-dark underline">sign in</Link> to start one.
            </div>
          )
        )}

        {canManage(role) && app.playersReady && app.players.length === 0 && (
          <Link to="/players" className="rounded-2xl bg-green-tint p-4 text-sm font-semibold text-green-dark">
            First step: add your players (names and photos) in Players →
          </Link>
        )}

        {shame.length > 0 && latest && (
          <section className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-extrabold">Hall of Shame</h2>
              <Link to={`/match/${latest.id}/awards`} className="flex min-h-11 items-center text-sm font-bold text-green-dark">
                See all
              </Link>
            </div>
            <div className={`-mx-[clamp(12px,4vw,20px)] flex snap-x snap-mandatory gap-2.5 overflow-x-auto ${pad} pb-1`}>
              {[...shame.filter((a) => !HERO_TITLES.has(a.key)), ...shame.filter((a) => HERO_TITLES.has(a.key))].map((a) => {
                const hero = HERO_TITLES.has(a.key);
                const p = app.byId.get(a.playerIds[0]);
                return (
                  <div key={a.key} className={`flex w-[136px] flex-none snap-start flex-col gap-2 rounded-2xl p-3 ${hero ? 'bg-green-tint' : 'bg-red-tint'}`}>
                    <Avatar player={p} name={app.name(a.playerIds[0])} size={44} tone={hero ? 'A' : 'B'} ring="bg-white!" />
                    <div className={`font-display text-base leading-tight font-extrabold ${hero ? 'text-green-dark' : 'text-red-dark'}`}>
                      {a.label} {a.playerIds.map(app.name).join(' & ')}
                    </div>
                    <div className="text-[13px]">{a.stat}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-extrabold">Recent matches</h2>
            {done.slice(0, 5).map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
            {done.length > 5 && (
              <Link to="/matches" className="flex min-h-11 items-center text-sm font-bold text-green-dark">
                All matches →
              </Link>
            )}
          </section>
        )}
      </main>
    </Page>
  );
}

export function MatchRow({ m }: { m: MatchDoc }) {
  return (
    <Link to={`/match/${m.id}`} className="flex min-h-14 items-center justify-between gap-2.5 rounded-2xl bg-surface px-3.5 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-bold">{matchTitle(m.meta)}</span>
        <span className="text-[13px] text-muted">
          {fmtDate(m.createdAt)}
          {m.status === 'live' ? ' · live' : ''}
        </span>
      </span>
      <span className="flex-none text-right text-[13px] font-bold text-green-dark">{resultLine(m)}</span>
    </Link>
  );
}
