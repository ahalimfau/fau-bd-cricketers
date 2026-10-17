// New match in two steps: split today's players into two teams, then set
// overs, toss, openers and the opening bowler.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { canScore } from '../config/roles';
import { useApp } from '../data/hooks';
import { createMatch, writeErrorText } from '../data/repo';
import type { MatchMeta, TeamKey } from '../engine/types';
import type { Player } from '../data/validate';
import { Avatar, Banner, Choice, Header, Label, Loading, Page, PlayerPick, Sheet, btn, pad } from '../ui/kit';

type Side = 'A' | 'B' | 'N';
const DRAFT_KEY = 'fau-new-match-draft';

interface Draft {
  sides: Record<string, Side>;
  nameA: string;
  nameB: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d || typeof d !== 'object' || typeof d.sides !== 'object' || d.sides === null) return null;
    const sides: Record<string, Side> = {};
    for (const [k, v] of Object.entries(d.sides)) if (v === 'A' || v === 'B' || v === 'N') sides[k] = v;
    return { sides, nameA: typeof d.nameA === 'string' ? d.nameA.slice(0, 30) : 'Tigers', nameB: typeof d.nameB === 'string' ? d.nameB.slice(0, 30) : 'Lions' };
  } catch {
    return null;
  }
}

function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode: the draft just isn't remembered */
  }
}

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function NewMatch() {
  const app = useApp();
  const navigate = useNavigate();
  const initial = useMemo(loadDraft, []);
  const [step, setStep] = useState<1 | 2>(1);
  const [sides, setSides] = useState<Record<string, Side>>(initial?.sides ?? {});
  const [nameA, setNameA] = useState(initial?.nameA ?? 'Tigers');
  const [nameB, setNameB] = useState(initial?.nameB ?? 'Lions');
  const [captains, setCaptains] = useState<TeamKey | null>(null);
  const [overs, setOvers] = useState(app.defaultOvers);
  const [tossWinner, setTossWinner] = useState<TeamKey | undefined>();
  const [tossChoice, setTossChoice] = useState<'bat' | 'bowl' | undefined>();
  const [striker, setStriker] = useState<string | undefined>();
  const [nonStriker, setNonStriker] = useState<string | undefined>();
  const [bowler, setBowler] = useState<string | undefined>();
  const [picking, setPicking] = useState<'striker' | 'nonStriker' | 'bowler' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOvers(app.defaultOvers), [app.defaultOvers]);
  useEffect(() => saveDraft({ sides, nameA, nameB }), [sides, nameA, nameB]);

  const roster = app.players.filter((p) => p.active);
  const side = (id: string): Side => sides[id] ?? 'N';
  const teamA = roster.filter((p) => side(p.id) === 'A');
  const teamB = roster.filter((p) => side(p.id) === 'B');
  const out = roster.filter((p) => side(p.id) === 'N');

  const battingFirst: TeamKey | undefined = tossWinner && tossChoice ? (tossChoice === 'bat' ? tossWinner : tossWinner === 'A' ? 'B' : 'A') : undefined;
  const batTeam = battingFirst === 'A' ? teamA : battingFirst === 'B' ? teamB : [];
  const bowlTeam = battingFirst === 'A' ? teamB : battingFirst === 'B' ? teamA : [];
  const nm = (k: TeamKey) => (k === 'A' ? nameA.trim() || 'Team A' : nameB.trim() || 'Team B');

  // Openers and bowler must belong to the right sides; reset if teams/toss change.
  useEffect(() => {
    if (striker && !batTeam.some((p) => p.id === striker)) setStriker(undefined);
    if (nonStriker && !batTeam.some((p) => p.id === nonStriker)) setNonStriker(undefined);
    if (bowler && !bowlTeam.some((p) => p.id === bowler)) setBowler(undefined);
  }, [battingFirst, sides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!app.auth.ready || !app.playersReady) return <Page><Loading /></Page>;
  if (!canScore(app.auth.role)) {
    return (
      <Page>
        <Header title="New match" back="/" />
        <div className={`${pad} flex flex-col gap-4 py-6`}>
          <p>Only the scorer or admin login can create matches.</p>
          <Link to="/login" className={btn.primary}>Sign in</Link>
        </div>
      </Page>
    );
  }

  const tap = (p: Player) => {
    const cur = side(p.id);
    let next: Side;
    if (captains) {
      // Captains pick: each tap gives the player to whoever's turn it is.
      if (cur !== 'N') next = 'N';
      else {
        next = captains;
        setCaptains(captains === 'A' ? 'B' : 'A');
      }
    } else next = cur === 'N' ? 'A' : cur === 'A' ? 'B' : 'N';
    setSides({ ...sides, [p.id]: next });
  };

  const random = () => {
    const pool = roster.filter((p) => side(p.id) !== 'N');
    const list = pool.length >= 4 ? pool : roster;
    const order = shuffle(list);
    const next: Record<string, Side> = { ...sides };
    order.forEach((p, i) => (next[p.id] = i % 2 === 0 ? 'A' : 'B'));
    setSides(next);
    setCaptains(null);
  };

  const teamsOk = teamA.length >= 2 && teamB.length >= 2 && teamA.length <= 30 && teamB.length <= 30;
  const namesOk = nameA.trim().length > 0 && nameB.trim().length > 0 && nameA.trim().toLowerCase() !== nameB.trim().toLowerCase();
  const ready = teamsOk && namesOk && !!battingFirst && !!striker && !!nonStriker && striker !== nonStriker && !!bowler;

  const start = () => {
    if (!ready || !battingFirst || !striker || !nonStriker || !bowler || !app.auth.uid) return;
    const meta: MatchMeta = {
      oversPerInnings: overs,
      battingFirst,
      teamA: { name: nameA.trim().slice(0, 30), playerIds: teamA.map((p) => p.id) },
      teamB: { name: nameB.trim().slice(0, 30), playerIds: teamB.map((p) => p.id) },
      toss: tossWinner && tossChoice ? { winner: tossWinner, choice: tossChoice } : undefined,
    };
    try {
      const { id, saved } = createMatch(
        meta,
        [
          { kind: 'setOpeners', inn: 1, strikerId: striker, nonStrikerId: nonStriker },
          { kind: 'setBowler', inn: 1, bowlerId: bowler },
        ],
        app.auth.uid,
      );
      saved.catch((e) => setError(writeErrorText(e)));
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      navigate(`/score/${id}`);
    } catch (e) {
      setError(writeErrorText(e));
    }
  };

  if (step === 1) {
    const ringFor: Record<Side, string> = { A: 'ring-[3px] ring-green-dark', B: 'ring-[3px] ring-red', N: 'ring-[3px] ring-line' };
    return (
      <Page>
        <Header title="Pick teams" sub={captains ? `Captains pick · ${nm(captains)} to choose` : 'Step 1 of 2 · tap a player to move them'} back="/" />
        <div className={`grid grid-cols-3 gap-2 ${pad} py-2`}>
          <div className="flex min-w-0 flex-col rounded-2xl bg-green-dark px-2.5 py-2 text-white">
            <span className="truncate text-[11px] font-extrabold tracking-wide">A · {nm('A').toUpperCase()}</span>
            <span className="font-display text-[clamp(22px,7vw,28px)] leading-tight font-extrabold">{teamA.length}</span>
          </div>
          <div className="flex min-w-0 flex-col rounded-2xl bg-red px-2.5 py-2 text-white">
            <span className="truncate text-[11px] font-extrabold tracking-wide">B · {nm('B').toUpperCase()}</span>
            <span className="font-display text-[clamp(22px,7vw,28px)] leading-tight font-extrabold">{teamB.length}</span>
          </div>
          <div className="flex min-w-0 flex-col rounded-2xl border-[1.5px] border-line bg-surface px-2.5 py-2 text-muted">
            <span className="truncate text-[11px] font-extrabold tracking-wide">NOT PLAYING</span>
            <span className="font-display text-[clamp(22px,7vw,28px)] leading-tight font-extrabold text-ink">{out.length}</span>
          </div>
        </div>
        <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 ${pad} pt-1 pb-2.5`}>
          <button type="button" onClick={random} className={btn.outline + ' min-h-11 text-sm'}>
            Random split
          </button>
          <button type="button" aria-pressed={!!captains} onClick={() => setCaptains(captains ? null : 'A')} className={(captains ? btn.primary + ' min-h-11 text-sm' : btn.outline + ' min-h-11 text-sm')}>
            {captains ? 'Picking…' : 'Captains pick'}
          </button>
          <button type="button" onClick={() => { setSides({}); setCaptains(null); }} className={btn.ghost + ' min-h-11 px-3.5 text-sm text-muted'}>
            Clear
          </button>
        </div>
        {roster.length === 0 ? (
          <div className={`${pad} py-6`}>
            <Banner tone="grey">No players yet. The admin adds them in Players.</Banner>
          </div>
        ) : (
          <div className={`grid flex-1 grid-cols-[repeat(auto-fill,minmax(64px,1fr))] content-start gap-x-1.5 gap-y-3 ${pad} pt-1 pb-4`}>
            {roster.map((p) => {
              const s = side(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => tap(p)}
                  aria-label={`${p.name}, ${s === 'A' ? nm('A') : s === 'B' ? nm('B') : 'not playing'}. Tap to move.`}
                  className={`flex min-h-[78px] min-w-0 flex-col items-center gap-1 ${s === 'N' ? 'opacity-55' : ''}`}
                >
                  <span className="relative">
                    <Avatar player={p} size={52} tone={s} ring={ringFor[s]} />
                    {s !== 'N' && (
                      <span className={`absolute -right-1.5 -bottom-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white text-[11px] font-extrabold text-white ${s === 'A' ? 'bg-green-dark' : 'bg-red'}`}>
                        {s}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate text-xs font-bold">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className={`sticky bottom-0 border-t border-line bg-white ${pad} pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]`}>
          {!teamsOk && roster.length > 0 && <p className="pb-2 text-center text-[13px] text-muted">Each team needs at least 2 players.</p>}
          <button type="button" className={btn.primary} disabled={!teamsOk} onClick={() => setStep(2)}>
            Next: match setup
          </button>
        </div>
      </Page>
    );
  }

  const slot = (role: string, id: string | undefined, tone: 'A' | 'B', onTap: () => void, disabled: boolean) => {
    const p = id ? app.byId.get(id) : undefined;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onTap}
        className="flex min-h-[58px] items-center gap-3 rounded-2xl border-[1.5px] border-line bg-white px-3 py-1.5 text-left disabled:opacity-40"
      >
        <Avatar player={p} name={p?.name ?? '?'} size={38} tone={tone} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-muted">{role}</span>
          <span className="truncate text-base font-extrabold">{p?.name ?? 'Tap to pick'}</span>
        </span>
        <span className="text-sm font-bold text-green-dark">{p ? 'Change' : 'Pick'}</span>
      </button>
    );
  };

  const input = 'h-[50px] w-full rounded-xl border-2 bg-white px-3 text-base font-bold text-ink focus:outline-none';
  return (
    <Page>
      <header className={`flex items-center gap-2.5 ${pad} pt-3 pb-1.5`}>
        <button type="button" aria-label="Back" onClick={() => setStep(1)} className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="font-display text-[22px] font-extrabold">Match setup</h1>
          <span className="text-[13px] text-muted">Step 2 of 2</span>
        </div>
      </header>
      <div className={`flex flex-1 flex-col gap-[18px] ${pad} pt-2 pb-4`}>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
            A · {teamA.length} players
            <input className={`${input} border-green-dark`} value={nameA} maxLength={30} onChange={(e) => setNameA(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
            B · {teamB.length} players
            <input className={`${input} border-red`} value={nameB} maxLength={30} onChange={(e) => setNameB(e.target.value)} />
          </label>
        </div>
        {!namesOk && <Banner tone="red">Give the two teams different names.</Banner>}

        <div className="flex flex-col gap-2">
          <Label>Overs per innings</Label>
          <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-3">
            <button type="button" aria-label="Fewer overs" onClick={() => setOvers((o) => Math.max(1, o - 1))} className="h-14 rounded-2xl bg-surface text-[28px]">
              −
            </button>
            <span className="text-center font-display text-[clamp(36px,12vw,48px)] font-extrabold text-green-dark">{overs}</span>
            <button type="button" aria-label="More overs" onClick={() => setOvers((o) => Math.min(50, o + 1))} className="h-14 rounded-2xl bg-surface text-[28px]">
              +
            </button>
          </div>
          <span className="text-[13px] text-muted">
            Innings ends after {overs} overs, or when {Math.max(1, teamA.length - 1)} ({nm('A')}) / {Math.max(1, teamB.length - 1)} ({nm('B')}) wickets fall.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Toss won by</Label>
          <Choice value={tossWinner} onChange={setTossWinner} options={[{ value: 'A' as TeamKey, label: nm('A') }, { value: 'B' as TeamKey, label: nm('B') }]} />
          <Choice value={tossChoice} onChange={setTossChoice} options={[{ value: 'bat' as const, label: 'Chose to bat' }, { value: 'bowl' as const, label: 'Chose to bowl' }]} />
          {battingFirst && <span className="text-[13px] font-semibold text-green-dark">{nm(battingFirst)} bat first.</span>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>
            Openers{battingFirst ? ` (${nm(battingFirst)})` : ''} and first bowler{battingFirst ? ` (${nm(battingFirst === 'A' ? 'B' : 'A')})` : ''}
          </Label>
          {slot('Striker', striker, battingFirst ?? 'A', () => setPicking('striker'), !battingFirst)}
          {slot('Non-striker', nonStriker, battingFirst ?? 'A', () => setPicking('nonStriker'), !battingFirst)}
          {slot('Opening bowler', bowler, battingFirst === 'A' ? 'B' : 'A', () => setPicking('bowler'), !battingFirst)}
          {!battingFirst && <span className="text-[13px] text-muted">Set the toss first.</span>}
        </div>
        {error && <Banner tone="red">{error}</Banner>}
      </div>
      <div className={`sticky bottom-0 border-t border-line bg-white ${pad} pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]`}>
        <button type="button" className={btn.primary} disabled={!ready} onClick={start}>
          Start match
        </button>
      </div>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={picking === 'bowler' ? 'Opening bowler' : picking === 'striker' ? 'Striker' : 'Non-striker'}>
        <PlayerPick
          players={picking === 'bowler' ? bowlTeam : batTeam}
          selected={picking === 'bowler' ? bowler : picking === 'striker' ? striker : nonStriker}
          tone={picking === 'bowler' ? (battingFirst === 'A' ? 'B' : 'A') : (battingFirst ?? 'A')}
          disabled={(id) => (picking === 'striker' ? id === nonStriker : picking === 'nonStriker' ? id === striker : false)}
          onPick={(id) => {
            if (picking === 'bowler') setBowler(id);
            else if (picking === 'striker') setStriker(id);
            else setNonStriker(id);
            setPicking(null);
          }}
        />
      </Sheet>
    </Page>
  );
}
