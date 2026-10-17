// Read-only live view for everyone (no login), plus the match's admin actions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { replay } from '../engine/replay';
import { HERO_TITLES, computeAwards } from '../engine/awards';
import type { MatchEvent } from '../engine/types';
import { canManage, canScore } from '../config/roles';
import { useApp, useMatch } from '../data/hooks';
import { deleteMatch, writeErrorText } from '../data/repo';
import { useMatchWriter } from '../data/useMatchWriter';
import { BackButton, Banner, Loading, Page, Sheet, btn, chipCls, fmtDate, pad } from '../ui/kit';
import { ShareButton } from '../ui/ShareButton';
import { figures, matchTitle, rate, requiredRate, scoreText, situation, teamName } from '../ui/cricket';

function isExtension(prev: MatchEvent[], next: MatchEvent[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) return false;
  return true;
}

export function MatchView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const app = useApp();
  const live = useMatch(id);
  const match = live.match;
  const events = match?.clean.events;
  const state = useMemo(() => (match && events ? replay(match.meta, events) : null), [match, events]);
  const card = useRef<HTMLDivElement>(null);
  const [corrected, setCorrected] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const prev = useRef<MatchEvent[] | null>(null);
  const onError = useCallback((m: string) => setMsg(m), []);
  const write = useMatchWriter(match, onError);

  // "Score corrected" note for viewers when the scorer undoes or edits a ball.
  useEffect(() => {
    if (!events) return;
    if (prev.current && !isExtension(prev.current, events)) {
      setCorrected(true);
      const t = window.setTimeout(() => setCorrected(false), 6000);
      prev.current = events;
      return () => window.clearTimeout(t);
    }
    prev.current = events;
  }, [events]);

  if (!live.ready) return <Page><Loading /></Page>;
  if (!match || !state) {
    return (
      <Page>
        <div className={`${pad} flex flex-col gap-4 py-10`}>
          <p className="text-lg font-bold">{live.error ?? 'This match was not found. It may have been deleted.'}</p>
          <Link to="/" className={btn.outline}>Home</Link>
        </div>
      </Page>
    );
  }

  const meta = match.meta;
  const isLive = match.status === 'live';
  const cur = state.innings[state.current - 1];
  const other = state.innings[state.current === 1 ? 1 : 0];
  const rrr = requiredRate(meta, state);
  const awards = computeAwards(state, app.cfg);
  const shame = awards.filter((a) => !HERO_TITLES.has(a.key));
  const overs = [...cur.overList].filter((o) => o.balls.length > 0).reverse().slice(0, 4);

  return (
    <Page>
      <header className={`flex items-center gap-2 ${pad} pt-3 pb-1`}>
        <BackButton to="/" />
        {isLive && (
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-red px-2.5 py-1 text-xs font-extrabold tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{matchTitle(meta)}</span>
        <ShareButton target={card} fileName="fau-bd-score" text={`${matchTitle(meta)}: ${situation(meta, state)}`} />
      </header>

      {corrected && (
        <div className={`${pad} pt-1`}>
          <Banner tone="grey">Score corrected by the scorer.</Banner>
        </div>
      )}

      <div ref={card} className="flex flex-col gap-3 bg-white pt-2 pb-3">
        <section className={`flex flex-col gap-1 ${pad}`}>
          <span className="text-sm text-muted">
            {cur.started ? teamName(meta, cur.battingTeam) : teamName(meta, cur.battingTeam) + ' (yet to bat)'}
            {state.current === 2 && cur.target ? ` · chasing ${cur.target}` : ''}
            {match.createdAt ? ` · ${fmtDate(match.createdAt)}` : ''}
          </span>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[clamp(44px,14vw,64px)] leading-none font-extrabold tracking-tight">{scoreText(cur)}</span>
            <span className="font-display text-lg font-semibold text-muted">({cur.overs} ov)</span>
            {cur.started && <span className="ml-auto text-[13px] text-muted">CRR {rate(cur.runs, cur.legalBalls)}</span>}
          </div>
          <div className="text-base font-bold text-green-dark">
            {situation(meta, state)}
            {rrr ? ` · RRR ${rrr}` : ''}
          </div>
          {other.started && (
            <div className="text-sm text-muted">
              {teamName(meta, other.battingTeam)} {scoreText(other)} ({other.overs} ov)
            </div>
          )}
        </section>

        {isLive && !state.complete && cur.started && (
          <section className={`mx-[clamp(12px,4vw,20px)] flex flex-col rounded-2xl bg-surface px-3 py-1`}>
            {[cur.strikerId, cur.nonStrikerId].filter(Boolean).map((bid) => {
              const b = cur.batters.find((x) => x.id === bid);
              return (
                <div key={bid} className="flex h-10 items-center gap-1.5">
                  <span className="w-3 font-extrabold text-green">{bid === cur.strikerId ? '*' : ''}</span>
                  <span className={`min-w-0 flex-1 truncate ${bid === cur.strikerId ? 'font-extrabold' : 'font-medium'}`}>{app.name(bid)}</span>
                  <span className="font-display text-lg font-extrabold">{b?.runs ?? 0}</span>
                  <span className="w-10 text-sm text-muted">({b?.balls ?? 0})</span>
                </div>
              );
            })}
            {cur.bowlerId && (
              <div className="flex h-10 items-center gap-1.5 border-t border-line">
                <span className="w-3" />
                <span className="min-w-0 flex-1 truncate font-bold">{app.name(cur.bowlerId)}</span>
                <span className="font-display font-semibold">{figures(cur, cur.bowlerId)}</span>
              </div>
            )}
          </section>
        )}

        {overs.length > 0 && (
          <section className={`flex flex-col gap-2 ${pad}`}>
            <h2 className="font-display text-lg font-extrabold">Recent overs</h2>
            {overs.map((o) => (
              <div key={o.number} className="flex items-center gap-2.5">
                <span className="flex w-16 flex-none flex-col leading-tight">
                  <span className="text-[13px] font-bold">Over {o.number}</span>
                  <span className="truncate text-xs text-muted">{app.name(o.bowlerId)}</span>
                </span>
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                  {o.balls.map((b) => (
                    <span key={b.eventIndex} className={`flex h-8 min-w-8 flex-none items-center justify-center rounded-full border-2 px-1 text-xs font-extrabold ${chipCls(b)}`}>
                      {b.label}
                    </span>
                  ))}
                </div>
                <span className="w-7 flex-none text-right font-display font-extrabold">{o.teamRuns}</span>
              </div>
            ))}
          </section>
        )}

        {shame.length > 0 && (
          <div className={`mx-[clamp(12px,4vw,20px)] rounded-2xl bg-red-tint px-3.5 py-3 text-sm leading-relaxed`}>
            <strong className="text-red-dark">{state.complete ? 'Hall of Shame:' : 'Shame ticker:'}</strong>{' '}
            {shame
              .slice(0, 4)
              .map((a) => `${a.label} ${a.playerIds.map(app.name).join(' & ')} (${a.stat})`)
              .join(' · ')}
          </div>
        )}
      </div>

      <div className={`flex flex-col gap-2.5 ${pad} pt-1 pb-[max(20px,env(safe-area-inset-bottom))]`}>
        {isLive && canScore(app.auth.role) && (
          <Link to={`/score/${match.id}`} className={btn.primary}>
            {state.complete ? 'Finish the match' : 'Score this match'}
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Link to={`/match/${match.id}/scorecard`} className={btn.outline}>
            Scorecard
          </Link>
          <Link to={`/match/${match.id}/awards`} className={btn.outline}>
            {state.complete ? 'Titles' : 'Titles so far'}
          </Link>
        </div>
        {!isLive && <p className="text-center text-sm text-muted">Finished and locked.</p>}
        {msg && <Banner tone="red">{msg}</Banner>}

        {canManage(app.auth.role) && (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border-[1.5px] border-line p-3">
            <span className="text-xs font-extrabold tracking-wider text-muted">ADMIN</span>
            {!isLive && (
              <button type="button" className={btn.ghost} onClick={() => write({ type: 'none' }, 'live')}>
                Reopen match (scorers can edit again)
              </button>
            )}
            {isLive && state.complete && (
              <button type="button" className={btn.ghost} onClick={() => write({ type: 'none' }, 'done')}>
                Finish and lock
              </button>
            )}
            <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)}>
              Delete match
            </button>
          </div>
        )}
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this match for good?" tone="red">
        <p className="text-sm">
          {matchTitle(meta)} and every ball in it will be gone, and its titles will be removed from the season. This can't be undone.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button
            type="button"
            className="min-h-14 rounded-2xl bg-red font-extrabold text-white"
            onClick={() => {
              deleteMatch(match.id).catch((e) => setMsg(writeErrorText(e)));
              setConfirmDelete(false);
              navigate('/');
            }}
          >
            Delete
          </button>
        </div>
      </Sheet>
    </Page>
  );
}
