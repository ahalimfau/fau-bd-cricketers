// The live scoring pad. One tap per legal ball; extras, wickets and fielding
// mistakes open a bottom sheet. Every entry can be undone (big UNDO button
// and the toast) or fixed later (tap any ball), because the score is always
// rebuilt from the ball-by-ball list.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { replay } from '../../engine/replay';
import { describeEvent } from '../../engine/events';
import { HERO_TITLES, computeAwards } from '../../engine/awards';
import type { BallEvent, MatchEvent, OopsType } from '../../engine/types';
import { canManage, canScore } from '../../config/roles';
import { useApp, useMatch } from '../../data/hooks';
import { useMatchWriter } from '../../data/useMatchWriter';
import type { Op } from '../../data/rawOps';
import { BackButton, Banner, Loading, Page, Sheet, btn, chipCls, pad } from '../../ui/kit';
import { figures, matchTitle, rate, requiredRate, scoreText, situation, teamName } from '../../ui/cricket';
import {
  BowlerSheet,
  ByesSheet,
  EditBallSheet,
  ExtrasSheet,
  NewBatterSheet,
  OopsSheet,
  OpenersSheet,
  OutSheet,
  RetireSheet,
  TimelineSheet,
  type Ctx,
} from './sheets';

type SheetState =
  | { kind: 'extras'; type: 'wd' | 'nb' }
  | { kind: 'byes'; type: 'b' | 'lb' }
  | { kind: 'out'; extra?: BallEvent['extra']; runsBat?: number }
  | { kind: 'oops'; type?: OopsType }
  | { kind: 'edit'; index: number }
  | { kind: 'bowler'; mode: 'over' | 'mid' }
  | { kind: 'bowlerFix'; index: number; current: string }
  | { kind: 'openers' }
  | { kind: 'newBatter' }
  | { kind: 'retire' }
  | { kind: 'more' }
  | { kind: 'timeline' }
  | { kind: 'endInnings' }
  | { kind: 'finish' }
  | null;

interface Toast {
  id: number;
  text: string;
  error?: boolean;
  boundary?: 4 | 6;
}

const RUNS = [0, 1, 2, 3, 4, 6];

export function Scoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const app = useApp();
  const live = useMatch(id);
  const match = live.match;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((t: Omit<Toast, 'id'>, ms = 4500) => {
    window.clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const onError = useCallback((msg: string) => showToast({ text: msg, error: true }, 8000), [showToast]);
  const write = useMatchWriter(match, onError);

  const events = match?.clean.events;
  const state = useMemo(() => (match && events ? replay(match.meta, events) : null), [match, events]);

  if (!app.auth.ready || !live.ready) return <Page><Loading /></Page>;
  if (!canScore(app.auth.role)) {
    return (
      <Page>
        <div className={`${pad} flex flex-col gap-4 py-10`}>
          <p className="text-lg font-bold">Sign in with the scorer login to score this match.</p>
          <Link to="/login" className={btn.primary}>Sign in</Link>
          {id && <Link to={`/match/${id}`} className={btn.outline}>Just watch</Link>}
        </div>
      </Page>
    );
  }
  if (!match || !state || !events) {
    return (
      <Page>
        <div className={`${pad} flex flex-col gap-4 py-10`}>
          <p className="text-lg font-bold">{live.error ?? 'This match was not found.'}</p>
          <Link to="/" className={btn.outline}>Home</Link>
        </div>
      </Page>
    );
  }
  if (match.status === 'done') {
    return (
      <Page>
        <div className={`${pad} flex flex-col gap-4 py-10`}>
          <p className="text-lg font-bold">This match is finished and locked.</p>
          <p className="text-muted">{state.result?.text}</p>
          {canManage(app.auth.role) && <p className="text-sm text-muted">As admin you can reopen it from the match page.</p>}
          <Link to={`/match/${match.id}`} className={btn.primary}>Open match page</Link>
        </div>
      </Page>
    );
  }

  const meta = match.meta;
  const inn = state.innings[state.current - 1];
  // At the innings break, keep showing the first-innings total rather than 0/0.
  const shownInn = state.current === 2 && !inn.started ? state.innings[0] : inn;
  const ctx: Ctx = { meta, state, inn, events, byId: app.byId, name: app.name };
  const over = inn.overList[inn.overList.length - 1];
  const close = () => setSheet(null);

  const run = (op: Op, text: string, extra?: Partial<Toast>) => {
    write(op);
    showToast({ text, ...extra });
  };
  const record = (e: MatchEvent | MatchEvent[], boundary?: 4 | 6) => {
    const list = Array.isArray(e) ? e : [e];
    const striker = inn.strikerId;
    const desc = describeEvent(list[list.length - 1], app.name);
    const who = list[0].kind === 'ball' && striker ? `${app.name(striker)} · ` : '';
    run({ type: 'append', events: list }, who + desc, { boundary });
    close();
  };
  const undo = () => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    run({ type: 'undo' }, `Undone: ${describeEvent(last, app.name)}`);
    close();
  };
  const tapRun = (r: number) =>
    record({ kind: 'ball', inn: inn.number, runsBat: r, ...(r === 4 || r === 6 ? { boundary: true } : {}), ts: Date.now() }, r === 4 || r === 6 ? (r as 4 | 6) : undefined);

  const needs = state.needs;
  const inningsOver = inn.complete;
  const blocked = state.complete || inningsOver || needs !== null;
  const rrr = requiredRate(meta, state);
  const chase = state.current === 2 && inn.started && !state.complete;
  const batters = [inn.strikerId, inn.nonStrikerId].filter((x): x is string => !!x);

  const fixNewBatter = (newId: string) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.inn === inn.number && e.kind === 'ball' && e.wicket && !e.wicket.newBatterId) {
        write({ type: 'replace', index: i, event: { ...e, wicket: { ...e.wicket, newBatterId: newId } } });
        showToast({ text: `${app.name(newId)} comes in` });
        close();
        return;
      }
    }
    onError("Couldn't find the wicket to attach the new batter to. Use Fix any entry.");
  };

  return (
    <Page>
      <header className="flex items-center gap-2 px-[clamp(10px,4vw,20px)] pt-1.5 pb-0.5">
        <BackButton to="/" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
          {chase ? `${teamName(meta, inn.battingTeam)} chasing ${inn.target}` : matchTitle(meta)}
        </span>
        <Link to={`/match/${match.id}/scorecard`} className="flex min-h-11 items-center text-sm font-bold text-green-dark">
          Scorecard
        </Link>
        <button type="button" onClick={() => setSheet({ kind: 'more' })} aria-label="More actions" className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface text-xl font-extrabold">
          ⋯
        </button>
      </header>

      <section className="flex flex-col gap-0.5 px-[clamp(10px,4vw,20px)] pb-[clamp(4px,1dvh,10px)]">
        <div className="flex flex-wrap items-baseline gap-2">
          {shownInn !== inn && <span className="text-[15px] font-bold text-muted">{teamName(meta, shownInn.battingTeam)}</span>}
          <span className="font-display text-[clamp(38px,12.5vw,60px)] leading-none font-extrabold tracking-tight">{scoreText(shownInn)}</span>
          <span className="font-display text-[clamp(16px,5vw,22px)] font-semibold text-muted">({shownInn.overs})</span>
          <span className="ml-auto text-[13px] text-muted">
            CRR {rate(shownInn.runs, shownInn.legalBalls)}
            {rrr ? ` · RRR ${rrr}` : ''}
          </span>
        </div>
        <div className="text-[clamp(13px,4vw,15px)] font-bold text-green-dark">
          {state.current === 1 && inn.started && !inn.complete ? `${meta.oversPerInnings} overs · ${teamName(meta, inn.battingTeam)} batting first` : situation(meta, state)}
        </div>
      </section>

      {batters.length > 0 && (
        <section className="mx-[clamp(10px,4vw,20px)] rounded-2xl bg-surface px-3 py-0.5">
          {batters.map((bid) => {
            const b = inn.batters.find((x) => x.id === bid);
            const on = bid === inn.strikerId;
            return (
              <button
                key={bid}
                type="button"
                onClick={() => !blocked && record({ kind: 'swapStrike', inn: inn.number })}
                aria-label={`${app.name(bid)}${on ? ', on strike' : ''}. Tap to swap strike.`}
                className="flex h-[clamp(34px,5dvh,42px)] w-full items-center gap-1.5 text-left"
              >
                <span className="w-3 flex-none font-extrabold text-green">{on ? '*' : ''}</span>
                <span className={`min-w-0 flex-1 truncate text-base ${on ? 'font-extrabold' : 'font-medium'}`}>{app.name(bid)}</span>
                <span className="font-display text-lg font-extrabold">{b?.runs ?? 0}</span>
                <span className="w-10 flex-none text-sm text-muted">({b?.balls ?? 0})</span>
                <span className="flex-none text-right text-xs text-muted">
                  {b?.fours ?? 0}×4 {b?.sixes ?? 0}×6
                </span>
              </button>
            );
          })}
        </section>
      )}

      {inn.bowlerId && (
        <section className="flex flex-col gap-1.5 px-[clamp(10px,4vw,20px)] pt-[clamp(6px,1.2dvh,12px)] pb-1">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D62839" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M5 7c4 2 4 8 0 10M19 7c-4 2-4 8 0 10" />
            </svg>
            <span className="min-w-0 flex-1 truncate font-extrabold">{app.name(inn.bowlerId)}</span>
            <span className="font-display text-base font-semibold">{figures(inn, inn.bowlerId)}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="flex-none text-xs text-muted">This over</span>
            {over?.balls.map((b) => (
              <button
                key={b.eventIndex}
                type="button"
                onClick={() => setSheet({ kind: 'edit', index: b.eventIndex })}
                aria-label={`Edit ball: ${b.label}`}
                className={`flex h-9 min-w-9 flex-none items-center justify-center rounded-full border-2 px-1.5 text-sm font-extrabold ${chipCls(b)}`}
              >
                {b.label}
              </button>
            ))}
            {over && over.balls.length === 0 && <span className="text-xs text-muted">no balls yet</span>}
          </div>
        </section>
      )}

      {live.pending && (
        <p className="px-[clamp(10px,4vw,20px)] text-xs font-semibold text-muted">Saving… (if there's no signal, it syncs when it's back)</p>
      )}
      {state.warnings.length > 0 && (
        <div className="px-[clamp(10px,4vw,20px)] pt-1">
          <Banner tone="red">
            {state.warnings[state.warnings.length - 1]}
            {state.warnings.length > 1 ? ` (+${state.warnings.length - 1} more)` : ''}{' '}
            <button type="button" className="underline" onClick={() => setSheet({ kind: 'timeline' })}>
              Fix
            </button>
          </Banner>
        </div>
      )}

      <div className="min-h-1 flex-1" />

      <section className="relative flex flex-col gap-[clamp(6px,1dvh,8px)] px-[clamp(10px,4vw,20px)] pb-[max(10px,env(safe-area-inset-bottom))]">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className={`absolute right-[clamp(10px,4vw,20px)] bottom-[calc(100%+6px)] left-[clamp(10px,4vw,20px)] z-30 flex min-h-[46px] items-center gap-2 rounded-2xl py-1 pr-1 pl-3.5 shadow-lg ${
              toast.error ? 'bg-red text-white' : 'bg-ink text-white'
            }`}
          >
            <span className={`min-w-0 flex-1 text-sm font-semibold ${toast.error ? '' : 'truncate'}`}>{toast.text}</span>
            {toast.boundary && (
              <button
                type="button"
                className="h-[38px] flex-none rounded-xl bg-red px-3 text-sm font-extrabold text-white"
                onClick={() => setSheet({ kind: 'oops', type: toast.boundary === 4 ? 'misfield4' : 'misfield6' })}
              >
                Leaked?
              </button>
            )}
            {!toast.error && !toast.text.startsWith('Undone') && (
              <button type="button" onClick={undo} className="h-[38px] flex-none rounded-xl bg-white px-3.5 text-sm font-extrabold text-green-dark">
                UNDO
              </button>
            )}
          </div>
        )}

        {state.complete ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-green-tint p-3.5">
            <span className="font-display text-xl font-extrabold text-green-dark">{state.result?.text}</span>
            <span className="text-sm">Check the scorecard, then finish the match to lock it and hand out the titles.</span>
            <button type="button" className={btn.primary} onClick={() => setSheet({ kind: 'finish' })}>
              Finish match
            </button>
          </div>
        ) : needs === 'openers' ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-green-tint p-3.5">
            <span className="font-bold text-green-dark">{situation(meta, state)}</span>
            <button type="button" className={btn.primary} onClick={() => setSheet({ kind: 'openers' })}>
              {state.current === 2 ? 'Start 2nd innings' : 'Pick openers and bowler'}
            </button>
          </div>
        ) : needs === 'bowler' ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-green-tint p-3.5">
            <span className="font-bold text-green-dark">{inn.overList.some((o) => o.balls.length) ? 'Over done. Pick the next bowler.' : 'Pick the bowler.'}</span>
            <button type="button" className={btn.primary} onClick={() => setSheet({ kind: 'bowler', mode: 'over' })}>
              Next bowler
            </button>
          </div>
        ) : needs === 'newBatter' ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-green-tint p-3.5">
            <span className="font-bold text-green-dark">A batter is missing.</span>
            <button type="button" className={btn.primary} onClick={() => setSheet({ kind: 'newBatter' })}>
              Pick the new batter
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-[clamp(6px,1dvh,8px)]">
          {RUNS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={blocked}
              onClick={() => tapRun(r)}
              className={`h-[clamp(44px,7.6dvh,66px)] rounded-2xl font-display text-[clamp(22px,7vw,30px)] font-extrabold disabled:opacity-35 ${
                r === 4 || r === 6 ? 'bg-green text-white active:bg-green-dark' : 'bg-surface text-ink active:bg-line'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-[clamp(6px,1dvh,8px)]">
          {(['wd', 'nb'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={blocked}
              onClick={() => setSheet({ kind: 'extras', type: t })}
              className="h-[clamp(44px,6.6dvh,56px)] rounded-2xl border-2 border-red bg-white text-base font-extrabold text-red-dark active:bg-red-tint disabled:opacity-35"
            >
              {t.toUpperCase()}
            </button>
          ))}
          {(['b', 'lb'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={blocked}
              onClick={() => setSheet({ kind: 'byes', type: t })}
              className="h-[clamp(44px,6.6dvh,56px)] rounded-2xl border-2 border-line bg-white text-[15px] font-bold active:bg-surface disabled:opacity-35"
            >
              {t === 'b' ? 'BYE' : 'LB'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-[clamp(6px,1dvh,8px)]">
          <button
            type="button"
            disabled={blocked}
            onClick={() => setSheet({ kind: 'out' })}
            className="h-[clamp(48px,7.4dvh,64px)] rounded-2xl bg-red text-[clamp(17px,5.4vw,21px)] font-extrabold tracking-wider text-white active:bg-red-dark disabled:opacity-35"
          >
            OUT
          </button>
          <button
            type="button"
            disabled={!inn.started}
            onClick={() => setSheet({ kind: 'oops' })}
            className="flex h-[clamp(48px,7.4dvh,64px)] flex-col items-center justify-center rounded-2xl bg-red-tint text-[13px] leading-tight font-extrabold text-red-dark disabled:opacity-35"
          >
            Fielding
            <span>oops</span>
          </button>
          <button
            type="button"
            disabled={events.length === 0}
            onClick={undo}
            aria-label="Undo last entry"
            className="flex h-[clamp(48px,7.4dvh,64px)] items-center justify-center gap-1 rounded-2xl border-[2.5px] border-ink bg-white text-[clamp(15px,4.8vw,18px)] font-extrabold active:bg-surface disabled:opacity-35"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
            UNDO
          </button>
        </div>
      </section>

      {/* ---------- Sheets ---------- */}
      <ExtrasSheet
        open={sheet?.kind === 'extras'}
        initial={sheet?.kind === 'extras' ? sheet.type : 'wd'}
        ctx={ctx}
        onClose={close}
        onRecord={(e) => record(e)}
        onWicket={(extra, runsBat) => setSheet({ kind: 'out', extra, runsBat })}
      />
      <ByesSheet
        open={sheet?.kind === 'byes'}
        initial={sheet?.kind === 'byes' ? sheet.type : 'b'}
        ctx={ctx}
        onClose={close}
        onRecord={(e) => record(e)}
        onWicket={(extra, runsBat) => setSheet({ kind: 'out', extra, runsBat })}
      />
      <OutSheet
        open={sheet?.kind === 'out'}
        ctx={ctx}
        extra={sheet?.kind === 'out' ? sheet.extra : undefined}
        runsBat={sheet?.kind === 'out' ? sheet.runsBat : 0}
        onClose={close}
        onConfirm={(b) => record(b)}
      />
      <OopsSheet
        open={sheet?.kind === 'oops'}
        ctx={ctx}
        presetType={sheet?.kind === 'oops' ? sheet.type : undefined}
        onClose={close}
        onSave={(o, index) => {
          const label = `Oops: ${app.name(o.fielderId)}`;
          if (index === undefined) run({ type: 'append', events: [{ kind: 'oops', inn: inn.number, oops: o }] }, label);
          else {
            const e = events[index] as BallEvent;
            run({ type: 'replace', index, event: { ...e, oops: [...(e.oops ?? []), o] } }, label);
          }
          close();
        }}
      />
      <EditBallSheet
        open={sheet?.kind === 'edit'}
        ctx={ctx}
        index={sheet?.kind === 'edit' ? sheet.index : -1}
        onClose={close}
        onSave={(e) => {
          if (sheet?.kind !== 'edit') return;
          run({ type: 'replace', index: sheet.index, event: e }, `Fixed: ${describeEvent(e, app.name)}`);
          close();
        }}
        onDelete={() => {
          if (sheet?.kind !== 'edit') return;
          run({ type: 'delete', index: sheet.index }, `Deleted: ${describeEvent(events[sheet.index], app.name)}`);
          close();
        }}
      />
      <BowlerSheet
        open={sheet?.kind === 'bowler' || sheet?.kind === 'bowlerFix'}
        ctx={ctx}
        mode={sheet?.kind === 'bowlerFix' ? 'replace' : sheet?.kind === 'bowler' ? sheet.mode : 'over'}
        current={sheet?.kind === 'bowlerFix' ? sheet.current : undefined}
        onClose={close}
        onPick={(bid) => {
          if (sheet?.kind === 'bowlerFix') {
            const e = events[sheet.index];
            if (e.kind === 'setBowler') run({ type: 'replace', index: sheet.index, event: { ...e, bowlerId: bid } }, `Fixed: ${app.name(bid)} bowled that over`);
            close();
          } else if (sheet?.kind === 'bowler') {
            record(sheet.mode === 'mid' ? { kind: 'setBowler', inn: inn.number, bowlerId: bid, midOver: true } : { kind: 'setBowler', inn: inn.number, bowlerId: bid });
          }
        }}
      />
      <OpenersSheet open={sheet?.kind === 'openers'} ctx={ctx} onClose={close} onStart={(list) => record(list)} />
      <NewBatterSheet open={sheet?.kind === 'newBatter'} ctx={ctx} onClose={close} onPick={fixNewBatter} />
      <RetireSheet
        open={sheet?.kind === 'retire'}
        ctx={ctx}
        onClose={close}
        onRetire={(pid, rid) => record({ kind: 'retire', inn: inn.number, playerId: pid, replacementId: rid })}
      />
      <TimelineSheet
        open={sheet?.kind === 'timeline'}
        ctx={ctx}
        onClose={close}
        onEditBall={(index) => setSheet({ kind: 'edit', index })}
        onEditBowler={(index, current) => setSheet({ kind: 'bowlerFix', index, current })}
        onDelete={(index) => {
          run({ type: 'delete', index }, `Deleted: ${describeEvent(events[index], app.name)}`);
        }}
      />

      <Sheet open={sheet?.kind === 'more'} onClose={close} title="More">
        <div className="flex flex-col gap-2">
          <button type="button" className={btn.ghost} disabled={blocked} onClick={() => record({ kind: 'swapStrike', inn: inn.number })}>
            Swap strike
          </button>
          <button type="button" className={btn.ghost} disabled={blocked || !over || over.balls.length === 0} onClick={() => setSheet({ kind: 'bowler', mode: 'mid' })}>
            Change bowler mid-over (injury)
          </button>
          <button type="button" className={btn.ghost} disabled={blocked} onClick={() => setSheet({ kind: 'retire' })}>
            Retire a batter
          </button>
          <button type="button" className={btn.ghost} disabled={events.length === 0} onClick={() => setSheet({ kind: 'timeline' })}>
            Fix any entry (all balls)
          </button>
          <button type="button" className={btn.danger} disabled={!inn.started || inn.complete} onClick={() => setSheet({ kind: 'endInnings' })}>
            End this innings now
          </button>
          <button type="button" className={btn.ghost} onClick={() => navigate(`/match/${match.id}`)}>
            Open viewer page
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet?.kind === 'endInnings'} onClose={close} title="End the innings now?" tone="red">
        <p className="text-sm">
          Use this for bad light, rain or an agreed early finish. {teamName(meta, inn.battingTeam)} stay on {scoreText(inn)} ({inn.overs} overs). UNDO brings it back.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={close}>
            Keep playing
          </button>
          <button type="button" className="min-h-14 rounded-2xl bg-red font-extrabold text-white" onClick={() => record({ kind: 'endInnings', inn: inn.number })}>
            End innings
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet?.kind === 'finish'} onClose={close} title="Finish and lock the match?">
        <p className="text-sm">
          <strong>{state.result?.text}</strong>. After this the scorer login can't change the match any more (only the admin can reopen it), and the titles count
          toward the season.
        </p>
        {state.complete && (
          <div className="flex flex-col gap-1.5">
            {computeAwards(state, app.cfg).map((a) => (
              <div key={a.key} className={`rounded-xl px-3 py-2 text-sm ${HERO_TITLES.has(a.key) ? 'bg-green-tint text-green-dark' : 'bg-red-tint text-red-dark'}`}>
                <strong>
                  {a.label} {a.playerIds.map(app.name).join(' & ')}
                </strong>{' '}
                · <span className="text-ink">{a.stat}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
          <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={close}>
            Not yet
          </button>
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              write({ type: 'none' }, 'done');
              close();
              navigate(`/match/${match.id}/awards`);
            }}
          >
            Finish match
          </button>
        </div>
      </Sheet>
    </Page>
  );
}
