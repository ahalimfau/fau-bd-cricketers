// Bottom sheets used by the live scoring pad. Each one builds a single event
// (or an edit of one) and hands it back; the pad does the saving, so every
// action here can be undone the same way.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { allowedDismissals, replay } from '../../engine/replay';
import { describeEvent } from '../../engine/events';
import type {
  BallEvent,
  BallView,
  ExtraType,
  InningsState,
  MatchEvent,
  MatchMeta,
  MatchState,
  OopsType,
  Wicket,
  WicketHow,
} from '../../engine/types';
import type { Player } from '../../data/validate';
import { Banner, Choice, Label, PlayerPick, Sheet, btn } from '../../ui/kit';
import {
  HOW_LABEL,
  availableBatters,
  battingIds,
  bowlingIds,
  figures,
  lastOverBowler,
  ordinal,
  plural,
  teamName,
} from '../../ui/cricket';

export interface Ctx {
  meta: MatchMeta;
  state: MatchState;
  inn: InningsState;
  events: MatchEvent[];
  byId: Map<string, Player>;
  name: (id?: string) => string;
}

function playersOf(ctx: Ctx, ids: string[]): Player[] {
  return ids.map((id) => ctx.byId.get(id) ?? { id, name: 'Unknown', active: true });
}

function Actions({ onCancel, onOk, ok, okLabel, danger }: { onCancel: () => void; onOk: () => void; ok: boolean; okLabel: string; danger?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5 pt-1">
      <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        disabled={!ok}
        className={danger ? 'flex min-h-14 items-center justify-center rounded-2xl bg-red px-3 text-[17px] font-extrabold text-white disabled:opacity-40' : btn.primary}
        onClick={onOk}
      >
        {okLabel}
      </button>
    </div>
  );
}

function Section({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** What the score would look like after this ball (used for the "who's on strike" note). */
function preview(ctx: Ctx, ball: BallEvent): MatchState {
  return replay(ctx.meta, [...ctx.events, ball]);
}

const RUN_BTN = 'flex h-14 items-center justify-center rounded-2xl font-display text-2xl font-extrabold';

function RunRow({ values, value, onChange, labels }: { values: number[]; value: number; onChange: (n: number) => void; labels?: Record<number, string> }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={`${RUN_BTN} ${v === value ? 'bg-green text-white' : 'bg-surface text-ink'}`}
        >
          {labels?.[v] ?? v}
        </button>
      ))}
    </div>
  );
}

// ---------- Wide / No-ball ----------

export function ExtrasSheet({
  open,
  initial,
  ctx,
  onClose,
  onRecord,
  onWicket,
}: {
  open: boolean;
  initial: 'wd' | 'nb';
  ctx: Ctx;
  onClose: () => void;
  onRecord: (e: BallEvent) => void;
  onWicket: (extra: NonNullable<BallEvent['extra']>, runsBat: number) => void;
}) {
  const [type, setType] = useState<'wd' | 'nb'>(initial);
  const [runs, setRuns] = useState(0);
  const [nbAs, setNbAs] = useState<'bat' | 'b' | 'lb'>('bat');
  useEffect(() => {
    if (open) {
      setType(initial);
      setRuns(0);
      setNbAs('bat');
    }
  }, [open, initial]);

  const bowler = ctx.inn.bowlerId;
  const bw = ctx.inn.bowlers.find((b) => b.id === bowler);
  const ball: BallEvent =
    type === 'wd'
      ? { kind: 'ball', inn: ctx.inn.number, runsBat: 0, extra: { type: 'wd', runs }, ts: Date.now() }
      : nbAs === 'bat'
        ? { kind: 'ball', inn: ctx.inn.number, runsBat: runs, boundary: runs === 4 || runs === 6 ? true : undefined, extra: { type: 'nb', runs: 0 }, ts: Date.now() }
        : { kind: 'ball', inn: ctx.inn.number, runsBat: 0, extra: { type: 'nb', runs, nbRunsAs: nbAs }, ts: Date.now() };
  const after = useMemo(() => (open ? preview(ctx, ball) : null), [open, ctx, type, runs, nbAs]); // eslint-disable-line react-hooks/exhaustive-deps
  const striker = after?.innings[ctx.inn.number - 1].strikerId;
  const count = type === 'wd' ? (bw?.wides ?? 0) + 1 : (bw?.noBalls ?? 0) + 1;
  const total = 1 + runs;
  const bowlerCharge = type === 'wd' ? total : 1 + (nbAs === 'bat' ? runs : 0);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
        {(['wd', 'nb'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => {
              setType(t);
              setRuns(0);
            }}
            className={`min-h-11 rounded-xl text-[15px] font-extrabold ${type === t ? 'bg-red text-white' : 'text-muted'}`}
          >
            {t === 'wd' ? 'Wide' : 'No-ball'}
          </button>
        ))}
      </div>
      <div>
        <h2 className="font-display text-[clamp(20px,6vw,24px)] leading-tight font-extrabold text-red-dark">
          {type === 'wd' ? (count > 1 ? 'Wide Bhai strikes again' : 'Wide!') : count > 1 ? 'No-Ball Nawab again' : 'No-ball!'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {ctx.name(bowler)}'s {ordinal(count)} {type === 'wd' ? 'wide' : 'no-ball'} of the match. 1 run is added automatically.
        </p>
      </div>
      {type === 'nb' && (
        <Choice
          value={nbAs}
          onChange={(v) => {
            setNbAs(v);
            setRuns(0);
          }}
          options={[
            { value: 'bat', label: 'Off the bat' },
            { value: 'b', label: 'Byes' },
            { value: 'lb', label: 'Leg byes' },
          ]}
        />
      )}
      <Section label={type === 'wd' ? 'Extra runs taken on top of the wide (4 = went to the boundary)' : nbAs === 'bat' ? 'Runs off the bat' : 'Runs taken'}>
        <RunRow values={type === 'nb' && nbAs === 'bat' ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4]} value={runs} onChange={setRuns} />
      </Section>
      <div className="rounded-2xl bg-surface px-3.5 py-3 text-sm leading-relaxed">
        <strong className="text-red-dark">{plural(total, 'run')}</strong> to {teamName(ctx.meta, ctx.inn.battingTeam)} · {plural(bowlerCharge, 'run')} charged to{' '}
        {ctx.name(bowler)} · doesn't count as a ball{striker ? ` · ${ctx.name(striker)} on strike next` : ''}
      </div>
      <button
        type="button"
        className="min-h-11 text-left text-sm font-bold text-green-dark underline"
        onClick={() =>
          // Runs are asked again in the wicket sheet ("runs completed"), so start from 0 here.
          onWicket(type === 'wd' ? { type: 'wd', runs: 0 } : nbAs === 'bat' ? { type: 'nb', runs: 0 } : { type: 'nb', runs: 0, nbRunsAs: nbAs }, 0)
        }
      >
        Wicket on this ball? ({type === 'wd' ? 'stumped, run out, hit wicket' : 'run out'})
      </button>
      <Actions onCancel={onClose} onOk={() => onRecord(ball)} ok okLabel={type === 'wd' ? 'Record wide' : 'Record no-ball'} />
    </Sheet>
  );
}

// ---------- Byes / Leg byes ----------

export function ByesSheet({
  open,
  initial,
  ctx,
  onClose,
  onRecord,
  onWicket,
}: {
  open: boolean;
  initial: 'b' | 'lb';
  ctx: Ctx;
  onClose: () => void;
  onRecord: (e: BallEvent) => void;
  onWicket: (extra: NonNullable<BallEvent['extra']>, runsBat: number) => void;
}) {
  const [type, setType] = useState<'b' | 'lb'>(initial);
  useEffect(() => {
    if (open) setType(initial);
  }, [open, initial]);
  const rec = (runs: number) => onRecord({ kind: 'ball', inn: ctx.inn.number, runsBat: 0, extra: { type, runs }, ts: Date.now() });
  return (
    <Sheet open={open} onClose={onClose} title={type === 'b' ? 'Byes' : 'Leg byes'}>
      <Choice
        value={type}
        onChange={setType}
        options={[
          { value: 'b', label: 'Byes' },
          { value: 'lb', label: 'Leg byes' },
        ]}
      />
      <Section label="How many runs? Tap to record. (Not charged to the bowler.)">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((r) => (
            <button key={r} type="button" onClick={() => rec(r)} className={`${RUN_BTN} bg-surface text-ink active:bg-green active:text-white`}>
              {r}
            </button>
          ))}
        </div>
      </Section>
      <button type="button" className="min-h-11 text-left text-sm font-bold text-green-dark underline" onClick={() => onWicket({ type, runs: 0 }, 0)}>
        Run out while taking {type === 'b' ? 'byes' : 'leg byes'}?
      </button>
      <button type="button" className={btn.ghost + ' min-h-14 rounded-2xl'} onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

// ---------- OUT ----------

export function OutSheet({
  open,
  ctx,
  extra,
  runsBat = 0,
  at,
  onClose,
  onConfirm,
}: {
  open: boolean;
  ctx: Ctx;
  extra?: BallEvent['extra'];
  runsBat?: number;
  /** For adding a wicket to an earlier ball: who was batting then. */
  at?: { strikerId: string; nonStrikerId: string };
  onClose: () => void;
  onConfirm: (ball: BallEvent) => void;
}) {
  const striker = at?.strikerId ?? ctx.inn.strikerId ?? '';
  const nonStriker = at?.nonStrikerId ?? ctx.inn.nonStrikerId ?? '';
  const hows = allowedDismissals(extra?.type);
  const [how, setHow] = useState<WicketHow | undefined>();
  const [outId, setOutId] = useState(striker);
  const [fielderId, setFielder] = useState<string | undefined>();
  const [newBatterId, setNewBatter] = useState<string | undefined>();
  const [runs, setRuns] = useState(0);
  const [nextStriker, setNextStriker] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setHow(hows.length === 1 ? hows[0] : undefined);
      setOutId(striker);
      setFielder(undefined);
      setNewBatter(undefined);
      setRuns(0);
      setNextStriker(undefined);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const eitherEnd = how === 'runout' || how === 'obstructing';
  const fielderLabel = how === 'caught' ? 'Caught by' : how === 'runout' ? 'Run out by (optional)' : how === 'stumped' ? 'Wicket-keeper (optional)' : null;
  const lastWicket = !at && ctx.inn.wickets + 1 >= ctx.inn.maxWickets;
  const candidates = availableBatters(ctx.meta, ctx.inn).filter((id) => id !== striker && id !== nonStriker);
  const needNewBatter = !lastWicket && candidates.length > 0;

  const ball: BallEvent | null = useMemo(() => {
    if (!how) return null;
    const out = eitherEnd ? outId : striker;
    const w: Wicket = { how, outId: out };
    if (fielderLabel && fielderId) w.fielderId = fielderId;
    if (newBatterId) w.newBatterId = newBatterId;
    if (nextStriker && eitherEnd) w.nextStrikerId = nextStriker;
    const e: BallEvent = { kind: 'ball', inn: ctx.inn.number, runsBat, wicket: w, ts: Date.now() };
    if (extra) e.extra = { ...extra };
    if (eitherEnd && runs) {
      if (!extra) e.runsBat = runs;
      else if (extra.type === 'nb' && !extra.nbRunsAs) e.runsBat = runs;
      else e.extra = { ...extra, runs: extra.runs + runs };
    }
    return e;
  }, [how, outId, fielderId, newBatterId, nextStriker, runs, extra, runsBat, striker, eitherEnd, fielderLabel, ctx.inn.number]);

  const after = useMemo(() => (open && ball && !at ? preview(ctx, ball) : null), [open, ball, at, ctx]);
  const afterInn = after?.innings[ctx.inn.number - 1];
  const ok = !!ball && (how !== 'caught' || !!fielderId) && (!needNewBatter || !!newBatterId);
  const outName = ctx.name(eitherEnd ? outId : striker);
  const bowlerGets = how && ['bowled', 'caught', 'lbw', 'stumped', 'hitwicket'].includes(how);

  return (
    <Sheet open={open} onClose={onClose} title={`${outName} is out!`} tone="red">
      <Section label="1 · How out?">
        <Choice
          tone="red"
          cols={hows.length > 4 ? 3 : hows.length}
          value={how}
          onChange={(v) => {
            setHow(v);
            setFielder(undefined);
            setNextStriker(undefined);
          }}
          options={hows.map((h) => ({ value: h, label: HOW_LABEL[h] }))}
        />
      </Section>
      {eitherEnd && (
        <>
          <Section label="Who is out?">
            <Choice
              tone="red"
              value={outId}
              onChange={setOutId}
              options={[
                { value: striker, label: ctx.name(striker), sub: 'striker' },
                { value: nonStriker, label: ctx.name(nonStriker), sub: 'non-striker' },
              ]}
            />
          </Section>
          {!at && (
            <Section label="Runs completed before the run out">
              <RunRow values={[0, 1, 2, 3]} value={runs} onChange={setRuns} />
            </Section>
          )}
        </>
      )}
      {fielderLabel && (
        <Section label={`2 · ${fielderLabel} (${teamName(ctx.meta, ctx.inn.bowlingTeam)})`}>
          <PlayerPick players={playersOf(ctx, bowlingIds(ctx.meta, ctx.inn))} selected={fielderId} onPick={(id) => setFielder(id === fielderId ? undefined : id)} tone="B" />
        </Section>
      )}
      {needNewBatter && (
        <Section label={`${fielderLabel ? '3' : '2'} · Next batter in`}>
          <PlayerPick players={playersOf(ctx, candidates)} selected={newBatterId} onPick={setNewBatter} tone="A" />
        </Section>
      )}
      {lastWicket && <Banner tone="red">This is the last wicket. The innings will end.</Banner>}
      {eitherEnd && newBatterId && (
        <Section label="Who faces the next ball?">
          <Choice
            value={nextStriker ?? afterInn?.strikerId}
            onChange={setNextStriker}
            options={[newBatterId, outId === striker ? nonStriker : striker].map((id) => ({ value: id, label: ctx.name(id) }))}
          />
        </Section>
      )}
      {how && (
        <div className="rounded-2xl bg-surface px-3.5 py-3 text-sm leading-relaxed">
          {how === 'caught' && newBatterId && (
            <>
              Caught: <strong>{ctx.name(newBatterId)} takes strike</strong> (2022 law).{' '}
            </>
          )}
          {bowlerGets ? `Wicket goes to ${ctx.name(ctx.inn.bowlerId)}.` : 'Not credited to the bowler.'}
          {afterInn?.strikerId && !(how === 'caught') && ` ${ctx.name(afterInn.strikerId)} on strike next.`}
        </div>
      )}
      <Actions onCancel={onClose} onOk={() => ball && onConfirm(ball)} ok={ok} okLabel="Confirm wicket" danger />
    </Sheet>
  );
}

// ---------- Fielding oops ----------

const OOPS_KINDS: { value: OopsType; label: string; sub: string }[] = [
  { value: 'drop', label: 'Dropped catch', sub: 'Counts for Miss' },
  { value: 'misfield4', label: 'Misfield → 4', sub: 'Counts for Chalni' },
  { value: 'misfield6', label: 'Misfield → 6', sub: 'Counts for Chalni' },
  { value: 'missedRunOut', label: 'Missed run-out', sub: 'Easy one, gone' },
  { value: 'overthrow', label: 'Overthrow', sub: 'Gift runs' },
];

function ballsOf(inn: InningsState): BallView[] {
  return inn.overList.flatMap((o) => o.balls);
}

function ballNo(b: BallView): string {
  return `${b.overNumber - 1}.${b.legal ? b.ballInOver : `${b.ballInOver}+`}`;
}

export function OopsSheet({
  open,
  ctx,
  presetType,
  onClose,
  onSave,
}: {
  open: boolean;
  ctx: Ctx;
  presetType?: OopsType;
  onClose: () => void;
  /** index = ball to attach to, or undefined for "not tied to a ball". */
  onSave: (oops: { type: OopsType; fielderId: string }, index: number | undefined) => void;
}) {
  const balls = ballsOf(ctx.inn);
  const lastBall = balls[balls.length - 1];
  const [type, setType] = useState<OopsType | undefined>(presetType);
  const [fielderId, setFielder] = useState<string | undefined>();
  const [index, setIndex] = useState<number | undefined>(lastBall?.eventIndex);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (open) {
      setType(presetType);
      setFielder(undefined);
      setIndex(lastBall?.eventIndex);
      setChoosing(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = balls.find((b) => b.eventIndex === index);
  const f = fielderId ? ctx.state.fielding[fielderId] : undefined;
  const drops = (f?.drops ?? 0) + (type === 'drop' ? 1 : 0);
  const existing = index !== undefined ? (ctx.events[index] as BallEvent).oops?.length ?? 0 : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Fielding oops">
      <p className="-mt-2 text-sm text-muted">Who let the team down? Counts toward Miss, Chalni and Shahin.</p>
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3.5 py-2.5 text-sm">
        <span className="min-w-0">
          {target ? (
            <>
              Ball <strong>{ballNo(target)}</strong> · {describeEvent(ctx.events[target.eventIndex], ctx.name)}
            </>
          ) : (
            'Not tied to a ball'
          )}
        </span>
        <button type="button" className="min-h-11 flex-none font-bold text-green-dark" onClick={() => setChoosing((c) => !c)}>
          {choosing ? 'Done' : 'Other ball'}
        </button>
      </div>
      {choosing && (
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {[...balls].reverse().slice(0, 30).map((b) => (
            <button
              key={b.eventIndex}
              type="button"
              onClick={() => {
                setIndex(b.eventIndex);
                setChoosing(false);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] px-3 text-left text-sm ${b.eventIndex === index ? 'border-green bg-green-tint' : 'border-line'}`}
            >
              <strong className="w-10 flex-none">{ballNo(b)}</strong>
              <span className="truncate">{describeEvent(ctx.events[b.eventIndex], ctx.name)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setIndex(undefined);
              setChoosing(false);
            }}
            className={`min-h-11 rounded-xl border-[1.5px] px-3 text-left text-sm ${index === undefined ? 'border-green bg-green-tint' : 'border-line'}`}
          >
            Not tied to a ball
          </button>
        </div>
      )}
      <Section label="What happened?">
        <div className="grid grid-cols-2 gap-2">
          {OOPS_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={type === k.value}
              onClick={() => setType(k.value)}
              className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-[1.5px] px-3 text-left ${type === k.value ? 'border-red bg-red text-white' : 'border-line bg-white'}`}
            >
              <span className="text-[15px] font-extrabold">{k.label}</span>
              <span className={`text-xs ${type === k.value ? 'text-white/90' : 'text-muted'}`}>{k.sub}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section label={`Which ${teamName(ctx.meta, ctx.inn.bowlingTeam)} fielder?`}>
        <PlayerPick players={playersOf(ctx, bowlingIds(ctx.meta, ctx.inn))} selected={fielderId} onPick={setFielder} tone="B" />
      </Section>
      {fielderId && type === 'drop' && (
        <Banner tone="red">
          {ctx.name(fielderId)}'s {ordinal(drops)} drop today.{drops >= 2 ? ` Miss ${ctx.name(fielderId)} is looking likely.` : ''}
        </Banner>
      )}
      {existing >= 5 && <Banner tone="red">This ball already has 5 oops. Pick another ball.</Banner>}
      <Actions onCancel={onClose} onOk={() => type && fielderId && onSave({ type, fielderId }, index)} ok={!!type && !!fielderId && existing < 5} okLabel="Save oops" danger />
    </Sheet>
  );
}

// ---------- Edit ball ----------

type BallType = 'legal' | ExtraType;

export function EditBallSheet({
  open,
  ctx,
  index,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  ctx: Ctx;
  index: number;
  onClose: () => void;
  onSave: (e: BallEvent) => void;
  onDelete: () => void;
}) {
  const original = ctx.events[index] as BallEvent | undefined;
  const view = useMemo(() => {
    for (const inn of ctx.state.innings) for (const o of inn.overList) for (const b of o.balls) if (b.eventIndex === index) return b;
    return undefined;
  }, [ctx.state, index]);

  const [type, setType] = useState<BallType>('legal');
  const [runs, setRuns] = useState(0);
  const [boundary, setBoundary] = useState(false);
  const [nbAs, setNbAs] = useState<'bat' | 'b' | 'lb'>('bat');
  const [wicket, setWicket] = useState<Wicket | undefined>();
  const [oops, setOops] = useState<BallEvent['oops']>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outAt, setOutAt] = useState<{ strikerId: string; nonStrikerId: string } | undefined>();

  useEffect(() => {
    setOutAt(undefined);
    if (!open || !original || original.kind !== 'ball') return;
    const t = original.extra?.type;
    setType(t ?? 'legal');
    setNbAs(t === 'nb' ? (original.extra?.nbRunsAs ?? (original.runsBat || !original.extra?.runs ? 'bat' : 'b')) : 'bat');
    setRuns(t === 'wd' || t === 'b' || t === 'lb' ? (original.extra?.runs ?? 0) : t === 'nb' && original.extra?.runs ? original.extra.runs : original.runsBat);
    setBoundary(!!original.boundary);
    setWicket(original.wicket);
    setOops(original.oops);
    setConfirmDelete(false);
  }, [open, index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!original || original.kind !== 'ball') return null;

  const build = (): BallEvent => {
    const e: BallEvent = { kind: 'ball', inn: original.inn, runsBat: 0 };
    if (original.ts) e.ts = original.ts;
    if (type === 'legal') {
      e.runsBat = runs;
      if (boundary && (runs === 4 || runs === 6)) e.boundary = true;
    } else if (type === 'nb') {
      if (nbAs === 'bat') {
        e.runsBat = runs;
        if (boundary && (runs === 4 || runs === 6)) e.boundary = true;
        e.extra = { type: 'nb', runs: 0 };
      } else e.extra = { type: 'nb', runs, nbRunsAs: nbAs };
    } else e.extra = { type, runs };
    if (wicket) e.wicket = wicket;
    if (oops?.length) e.oops = oops;
    return e;
  };

  const extraType = type === 'legal' ? undefined : type;
  const wicketOk = !wicket || allowedDismissals(extraType).includes(wicket.how);
  const runValues = type === 'legal' ? [0, 1, 2, 3, 4, 5, 6] : type === 'nb' && nbAs === 'bat' ? [0, 1, 2, 3, 4, 6] : type === 'b' || type === 'lb' ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];

  return (
    <Sheet open={open} onClose={onClose} title={view ? `Edit ball ${ballNo(view)}` : 'Edit ball'}>
      <p className="-mt-2 text-sm text-muted">
        Recorded as: {describeEvent(original, ctx.name)}
        {view ? `, ${ctx.name(view.strikerId)} facing ${ctx.name(view.bowlerId)}` : ''}
      </p>
      <Section label="Ball type">
        <Choice
          value={type}
          onChange={(v) => {
            setType(v);
            setRuns(v === 'b' || v === 'lb' ? 1 : 0);
            setBoundary(false);
            setNbAs('bat');
          }}
          options={[
            { value: 'legal', label: 'Legal' },
            { value: 'wd', label: 'WD' },
            { value: 'nb', label: 'NB' },
            { value: 'b', label: 'Bye' },
            { value: 'lb', label: 'LB' },
          ]}
        />
      </Section>
      {type === 'nb' && (
        <Choice
          value={nbAs}
          onChange={(v) => {
            setNbAs(v);
            setRuns(0);
          }}
          options={[
            { value: 'bat', label: 'Off the bat' },
            { value: 'b', label: 'Byes' },
            { value: 'lb', label: 'Leg byes' },
          ]}
        />
      )}
      <Section label={type === 'wd' ? 'Extra runs beyond the 1 wide' : 'Runs'}>
        <RunRow
          values={runValues}
          value={runs}
          onChange={(r) => {
            setRuns(r);
            setBoundary(r === 4 || r === 6);
          }}
        />
      </Section>
      {(type === 'legal' || (type === 'nb' && nbAs === 'bat')) && (runs === 4 || runs === 6) && (
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
          <input type="checkbox" checked={boundary} onChange={(e) => setBoundary(e.target.checked)} className="h-5 w-5 accent-green" />
          It was a boundary (counts as a {runs === 4 ? 'four' : 'six'})
        </label>
      )}
      {wicket ? (
        <div className={`flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-sm ${wicketOk ? 'bg-red-tint text-red-dark' : 'bg-red text-white'}`}>
          <span>
            Wicket: <strong>{ctx.name(wicket.outId)}</strong> {HOW_LABEL[wicket.how].toLowerCase()}
            {wicket.fielderId ? ` (${ctx.name(wicket.fielderId)})` : ''}
            {!wicketOk && ` isn't possible off a ${type === 'wd' ? 'wide' : 'no-ball'}. Remove it to save.`}
          </span>
          <button type="button" className="min-h-11 flex-none font-bold underline" onClick={() => setWicket(undefined)}>
            Remove
          </button>
        </div>
      ) : (
        view && (
          <button type="button" className={btn.danger} onClick={() => setOutAt({ strikerId: view.strikerId, nonStrikerId: view.nonStrikerId })}>
            + Wicket on this ball
          </button>
        )
      )}
      {oops?.map((o, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3.5 py-2 text-sm">
          <span>
            Oops: {ctx.name(o.fielderId)} · {OOPS_KINDS.find((k) => k.value === o.type)?.label}
          </span>
          <button type="button" className="min-h-11 flex-none font-bold text-red-dark underline" onClick={() => setOops(oops.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <Banner tone="grey">Saving recalculates every later ball, strike change, over and award.</Banner>
      {confirmDelete ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-red-tint p-3">
          <span className="text-sm font-semibold text-red-dark">Delete this ball completely? Later balls move up.</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn.ghost} onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="min-h-12 rounded-xl bg-red font-extrabold text-white" onClick={onDelete}>
              Delete ball
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
          <button type="button" className={btn.danger + ' min-h-14 rounded-2xl'} onClick={() => setConfirmDelete(true)}>
            Delete ball
          </button>
          <button type="button" className={btn.primary} disabled={!wicketOk} onClick={() => onSave(build())}>
            Save fix
          </button>
        </div>
      )}
      {/* Opens on top of this sheet so the edits above are kept. */}
      <OutSheet
        open={open && !!outAt}
        ctx={{ ...ctx, inn: ctx.state.innings[original.inn - 1] }}
        extra={extraType ? { type: extraType, runs: 0 } : undefined}
        at={outAt}
        onClose={() => setOutAt(undefined)}
        onConfirm={(b) => {
          setWicket(b.wicket);
          setOutAt(undefined);
        }}
      />
    </Sheet>
  );
}

// ---------- Bowler ----------

export function BowlerSheet({
  open,
  ctx,
  mode,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  ctx: Ctx;
  mode: 'over' | 'mid' | 'replace';
  current?: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | undefined>(current);
  useEffect(() => {
    if (open) setSel(current);
  }, [open, current]);
  const prev = mode === 'over' ? lastOverBowler(ctx.inn) : mode === 'mid' ? ctx.inn.bowlerId : undefined;
  const title = mode === 'over' ? (ctx.inn.overList.some((o) => o.balls.length) ? 'Over done. Next bowler?' : 'Opening bowler') : mode === 'mid' ? 'Change bowler mid-over' : 'Who bowled this over?';
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {mode === 'mid' && <p className="-mt-2 text-sm text-muted">For an injury or similar. The over carries on with the new bowler.</p>}
      <PlayerPick
        players={playersOf(ctx, bowlingIds(ctx.meta, ctx.inn))}
        selected={sel}
        onPick={setSel}
        tone="B"
        disabled={(id) => id === prev}
        note={(id) => (id === prev ? (mode === 'mid' ? 'bowling' : 'last over') : figures(ctx.inn, id) || ' ')}
      />
      <Actions onCancel={onClose} onOk={() => sel && onPick(sel)} ok={!!sel && sel !== prev} okLabel={sel ? `${ctx.name(sel)} to bowl` : 'Pick a bowler'} />
    </Sheet>
  );
}

// ---------- Openers (start of an innings) ----------

export function OpenersSheet({ open, ctx, onClose, onStart }: { open: boolean; ctx: Ctx; onClose: () => void; onStart: (events: MatchEvent[]) => void }) {
  const [striker, setStriker] = useState<string | undefined>();
  const [non, setNon] = useState<string | undefined>();
  const [bowler, setBowler] = useState<string | undefined>();
  useEffect(() => {
    if (open) {
      setStriker(undefined);
      setNon(undefined);
      setBowler(undefined);
    }
  }, [open]);
  const bat = playersOf(ctx, battingIds(ctx.meta, ctx.inn));
  const bowl = playersOf(ctx, bowlingIds(ctx.meta, ctx.inn));
  const inn = ctx.inn.number;
  return (
    <Sheet open={open} onClose={onClose} title={inn === 2 ? `${teamName(ctx.meta, ctx.inn.battingTeam)} chase ${ctx.inn.target}` : 'Start the innings'}>
      <Section label={`Striker (${teamName(ctx.meta, ctx.inn.battingTeam)})`}>
        <PlayerPick players={bat} selected={striker} onPick={setStriker} disabled={(id) => id === non} tone="A" />
      </Section>
      <Section label="Non-striker">
        <PlayerPick players={bat} selected={non} onPick={setNon} disabled={(id) => id === striker} tone="A" />
      </Section>
      <Section label={`Opening bowler (${teamName(ctx.meta, ctx.inn.bowlingTeam)})`}>
        <PlayerPick players={bowl} selected={bowler} onPick={setBowler} tone="B" />
      </Section>
      <Actions
        onCancel={onClose}
        ok={!!striker && !!non && !!bowler && striker !== non}
        okLabel={inn === 2 ? 'Start 2nd innings' : 'Start innings'}
        onOk={() =>
          striker &&
          non &&
          bowler &&
          onStart([
            { kind: 'setOpeners', inn, strikerId: striker, nonStrikerId: non },
            { kind: 'setBowler', inn, bowlerId: bowler },
          ])
        }
      />
    </Sheet>
  );
}

// ---------- New batter (only after an edit leaves a gap) ----------

export function NewBatterSheet({ open, ctx, onClose, onPick }: { open: boolean; ctx: Ctx; onClose: () => void; onPick: (id: string) => void }) {
  const [sel, setSel] = useState<string | undefined>();
  useEffect(() => {
    if (open) setSel(undefined);
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Who comes in to bat?">
      <PlayerPick players={playersOf(ctx, availableBatters(ctx.meta, ctx.inn))} selected={sel} onPick={setSel} tone="A" />
      <Actions onCancel={onClose} onOk={() => sel && onPick(sel)} ok={!!sel} okLabel="Send them in" />
    </Sheet>
  );
}

// ---------- Retire ----------

export function RetireSheet({ open, ctx, onClose, onRetire }: { open: boolean; ctx: Ctx; onClose: () => void; onRetire: (playerId: string, replacementId: string) => void }) {
  const [who, setWho] = useState<string | undefined>();
  const [rep, setRep] = useState<string | undefined>();
  useEffect(() => {
    if (open) {
      setWho(ctx.inn.strikerId);
      setRep(undefined);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = ctx.inn.strikerId ?? '';
  const n = ctx.inn.nonStrikerId ?? '';
  return (
    <Sheet open={open} onClose={onClose} title="Retire a batter">
      <p className="-mt-2 text-sm text-muted">Retired not out. It isn't a wicket, and they can bat again later.</p>
      <Section label="Who retires?">
        <Choice value={who} onChange={setWho} options={[{ value: s, label: ctx.name(s) }, { value: n, label: ctx.name(n) }]} />
      </Section>
      <Section label="Replacement">
        <PlayerPick players={playersOf(ctx, availableBatters(ctx.meta, ctx.inn))} selected={rep} onPick={setRep} tone="A" />
      </Section>
      <Actions onCancel={onClose} onOk={() => who && rep && onRetire(who, rep)} ok={!!who && !!rep} okLabel="Retire" />
    </Sheet>
  );
}

// ---------- Every entry, to fix anything ----------

export function TimelineSheet({
  open,
  ctx,
  onClose,
  onEditBall,
  onEditBowler,
  onDelete,
}: {
  open: boolean;
  ctx: Ctx;
  onClose: () => void;
  onEditBall: (index: number) => void;
  onEditBowler: (index: number, bowlerId: string) => void;
  onDelete: (index: number) => void;
}) {
  const [inn, setInn] = useState<1 | 2>(ctx.state.current);
  const [confirm, setConfirm] = useState<number | null>(null);
  useEffect(() => {
    if (open) {
      setInn(ctx.state.current);
      setConfirm(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const views = new Map<number, BallView>();
  for (const o of ctx.state.innings[inn - 1].overList) for (const b of o.balls) views.set(b.eventIndex, b);
  const rows = ctx.events.map((e, i) => ({ e, i })).filter((r) => r.e.inn === inn).reverse();
  return (
    <Sheet open={open} onClose={onClose} title="Fix any entry">
      <p className="-mt-2 text-sm text-muted">Newest first. Tap a ball to edit it, or a bowler to change who bowled that over.</p>
      {ctx.state.innings[1].started && (
        <Choice
          value={inn}
          onChange={setInn}
          options={[
            { value: 1, label: `1st · ${teamName(ctx.meta, ctx.state.innings[0].battingTeam)}` },
            { value: 2, label: `2nd · ${teamName(ctx.meta, ctx.state.innings[1].battingTeam)}` },
          ]}
        />
      )}
      <div className="flex flex-col gap-1.5">
        {rows.map(({ e, i }) => {
          const v = views.get(i);
          const editable = e.kind === 'ball' || e.kind === 'setBowler';
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!editable}
                onClick={() => (e.kind === 'ball' ? onEditBall(i) : e.kind === 'setBowler' ? onEditBowler(i, e.bowlerId) : undefined)}
                className={`flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border-[1.5px] px-3 text-left text-sm ${
                  e.kind === 'ball' ? 'border-line bg-white' : 'border-transparent bg-surface text-muted'
                }`}
              >
                <strong className="w-10 flex-none text-ink">{v ? ballNo(v) : ''}</strong>
                <span className="truncate">{describeEvent(e, ctx.name)}</span>
              </button>
              {confirm === i ? (
                <button type="button" className="min-h-12 flex-none rounded-xl bg-red px-3 text-sm font-extrabold text-white" onClick={() => onDelete(i)}>
                  Sure?
                </button>
              ) : (
                <button type="button" aria-label="Delete entry" className="min-h-12 w-11 flex-none rounded-xl text-lg text-red-dark" onClick={() => setConfirm(i)}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted">Nothing recorded in this innings yet.</p>}
      </div>
    </Sheet>
  );
}
