// New match in two steps:
//  1. Teams: tap a team, pick its captain from all players, then add up to
//     12 players (captain included). A player can only be on one team.
//  2. Setup: overs, toss, openers and the opening bowler.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { canScore } from '../config/roles';
import { useApp } from '../data/hooks';
import { createMatch, writeErrorText } from '../data/repo';
import type { MatchMeta, TeamKey } from '../engine/types';
import type { Player } from '../data/validate';
import { Avatar, Banner, Choice, Header, Label, Loading, Page, PlayerPick, Sheet, btn, pad } from '../ui/kit';
import {
  MAX_TEAM,
  MIN_TEAM,
  captainOf,
  cleanTeams,
  namesClash,
  other,
  setCaptain,
  teamOfPlayer,
  teamReady,
  togglePlayer,
  type Teams,
} from './teamDraft';

const DRAFT_KEY = 'fau-new-match-teams';
const EMPTY: Teams = { A: { name: 'Tigers', ids: [] }, B: { name: 'Lions', ids: [] } };

function loadDraft(): Teams {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Partial<Record<TeamKey, { name?: unknown; ids?: unknown }>>;
    const team = (t: { name?: unknown; ids?: unknown } | undefined, fallback: string) => ({
      name: typeof t?.name === 'string' ? t.name.slice(0, 30) : fallback,
      ids: Array.isArray(t?.ids) ? t.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_TEAM) : [],
    });
    return { A: team(d?.A, 'Tigers'), B: team(d?.B, 'Lions') };
  } catch {
    return EMPTY;
  }
}

function saveDraft(t: Teams) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(t));
  } catch {
    /* private mode: the draft just isn't remembered */
  }
}

const TEAM_BG: Record<TeamKey, string> = { A: 'bg-green-dark', B: 'bg-red' };
const RING: Record<TeamKey, string> = { A: 'ring-[3px] ring-green-dark', B: 'ring-[3px] ring-red' };

export function NewMatch() {
  const app = useApp();
  const navigate = useNavigate();
  const initial = useMemo(loadDraft, []);
  const [step, setStep] = useState<1 | 2>(1);
  const [teams, setTeams] = useState<Teams>(initial);
  const [editing, setEditing] = useState<{ team: TeamKey; mode: 'captain' | 'players' } | null>(null);
  const [overs, setOvers] = useState(app.defaultOvers);
  const [tossWinner, setTossWinner] = useState<TeamKey | undefined>();
  const [tossChoice, setTossChoice] = useState<'bat' | 'bowl' | undefined>();
  const [striker, setStriker] = useState<string | undefined>();
  const [nonStriker, setNonStriker] = useState<string | undefined>();
  const [bowler, setBowler] = useState<string | undefined>();
  const [picking, setPicking] = useState<'striker' | 'nonStriker' | 'bowler' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(() => app.players.filter((p) => p.active), [app.players]);

  useEffect(() => setOvers(app.defaultOvers), [app.defaultOvers]);
  useEffect(() => saveDraft(teams), [teams]);
  // Drop anyone who was deleted or hidden since the draft was saved.
  useEffect(() => {
    if (app.playersReady) setTeams((t) => cleanTeams(t, new Set(roster.map((p) => p.id))));
  }, [app.playersReady, roster]);

  const battingFirst: TeamKey | undefined = tossWinner && tossChoice ? (tossChoice === 'bat' ? tossWinner : other(tossWinner)) : undefined;
  const playersOf = (k: TeamKey): Player[] => teams[k].ids.map((id) => app.byId.get(id)).filter((p): p is Player => !!p);
  const batTeam = battingFirst ? playersOf(battingFirst) : [];
  const bowlTeam = battingFirst ? playersOf(other(battingFirst)) : [];
  const nm = (k: TeamKey) => teams[k].name.trim() || (k === 'A' ? 'Team A' : 'Team B');

  // Openers and bowler must belong to the right sides; reset if teams/toss change.
  useEffect(() => {
    if (striker && !batTeam.some((p) => p.id === striker)) setStriker(undefined);
    if (nonStriker && !batTeam.some((p) => p.id === nonStriker)) setNonStriker(undefined);
    if (bowler && !bowlTeam.some((p) => p.id === bowler)) setBowler(undefined);
  }, [battingFirst, teams]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const teamsOk = teamReady(teams.A) && teamReady(teams.B) && !namesClash(teams);
  const ready = teamsOk && !!battingFirst && !!striker && !!nonStriker && striker !== nonStriker && !!bowler;

  const start = () => {
    if (!ready || !battingFirst || !striker || !nonStriker || !bowler || !app.auth.uid) return;
    const meta: MatchMeta = {
      oversPerInnings: overs,
      battingFirst,
      // Captain stays first in each list.
      teamA: { name: nm('A').slice(0, 30), playerIds: [...teams.A.ids] },
      teamB: { name: nm('B').slice(0, 30), playerIds: [...teams.B.ids] },
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

  // ---------- Step 1: teams ----------
  if (step === 1) {
    const ed = editing;
    const edTeam = ed ? teams[ed.team] : null;
    const edCaptain = edTeam ? captainOf(edTeam) : undefined;

    return (
      <Page>
        <Header title="Pick teams" sub="Step 1 of 2 · tap a team" back="/" />
        {roster.length === 0 ? (
          <div className={`${pad} py-6`}>
            <Banner tone="grey">No players yet. The admin adds them in Players.</Banner>
          </div>
        ) : (
          <div className={`flex flex-1 flex-col gap-3 ${pad} pt-2 pb-4`}>
            {(['A', 'B'] as const).map((k) => {
              const t = teams[k];
              const cap = captainOf(t);
              const capP = cap ? app.byId.get(cap) : undefined;
              const members = playersOf(k).slice(1);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEditing({ team: k, mode: cap ? 'players' : 'captain' })}
                  className="flex flex-col gap-3 overflow-hidden rounded-[20px] border-[1.5px] border-line bg-white text-left shadow-[0_2px_10px_rgba(16,35,26,0.06)] active:bg-surface"
                >
                  <div className={`flex items-center justify-between gap-2 px-4 py-3 text-white ${TEAM_BG[k]}`}>
                    <span className="min-w-0 truncate font-display text-xl font-extrabold">
                      {k} · {nm(k)}
                    </span>
                    <span className="flex-none font-display text-lg font-extrabold">
                      {t.ids.length}/{MAX_TEAM}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-4">
                    {capP ? (
                      <>
                        <Avatar player={capP} size={44} tone={k} />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-xs font-bold text-muted">CAPTAIN</span>
                          <span className="truncate text-base font-extrabold">{capP.name}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-[15px] font-bold text-green-dark">Tap to pick the captain →</span>
                    )}
                  </div>
                  <div className="flex min-h-9 flex-wrap items-center gap-1.5 px-4 pb-4">
                    {members.length > 0 ? (
                      members.map((p) => <Avatar key={p.id} player={p} size={32} tone={k} />)
                    ) : (
                      <span className="text-sm text-muted">{cap ? 'Tap to add players' : 'No players yet'}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {namesClash(teams) && <Banner tone="red">Give the two teams different names.</Banner>}
          </div>
        )}
        <div className={`sticky bottom-0 border-t border-line bg-white ${pad} pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]`}>
          {!teamsOk && roster.length > 0 && (
            <p className="pb-2 text-center text-[13px] text-muted">
              Each team needs a captain and at least {MIN_TEAM} players (max {MAX_TEAM}).
            </p>
          )}
          <button type="button" className={btn.primary} disabled={!teamsOk} onClick={() => setStep(2)}>
            Next: match setup
          </button>
        </div>

        {/* Captain picker: any active player not on the other team. */}
        <Sheet open={ed?.mode === 'captain'} onClose={() => setEditing(null)} title={ed ? `Who's the captain of ${nm(ed.team)}?` : ''}>
          {ed && (
            <PlayerPick
              players={roster}
              selected={edCaptain}
              tone={ed.team}
              disabled={(id) => teamOfPlayer(teams, id) === other(ed.team) || (!teams[ed.team].ids.includes(id) && teams[ed.team].ids.length >= MAX_TEAM)}
              note={(id) => (teamOfPlayer(teams, id) === other(ed.team) ? nm(other(ed.team)) : id === edCaptain ? 'captain' : ' ')}
              onPick={(id) => {
                setTeams((t) => setCaptain(t, ed.team, id));
                setEditing({ team: ed.team, mode: 'players' });
              }}
            />
          )}
        </Sheet>

        {/* Team editor: name, captain, players. */}
        <Sheet open={ed?.mode === 'players'} onClose={() => setEditing(null)}>
          {ed && edTeam && (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
                Team {ed.team} name
                <input
                  value={edTeam.name}
                  maxLength={30}
                  onChange={(e) => {
                    const name = e.target.value;
                    setTeams((t) => ({ ...t, [ed.team]: { ...t[ed.team], name } }));
                  }}
                  className={`h-[50px] w-full rounded-xl border-2 bg-white px-3 text-base font-extrabold text-ink focus:outline-none ${ed.team === 'A' ? 'border-green-dark' : 'border-red'}`}
                />
              </label>
              {edCaptain && (
                <div className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2">
                  <Avatar player={app.byId.get(edCaptain)} name={app.name(edCaptain)} size={44} tone={ed.team} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs font-bold text-muted">CAPTAIN</span>
                    <span className="truncate font-extrabold">{app.name(edCaptain)}</span>
                  </span>
                  <button type="button" className="min-h-11 flex-none px-2 font-bold text-green-dark" onClick={() => setEditing({ team: ed.team, mode: 'captain' })}>
                    Change
                  </button>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <Label>Players · tap to add or remove</Label>
                <span className={`font-display text-lg font-extrabold ${edTeam.ids.length >= MAX_TEAM ? 'text-red-dark' : 'text-green-dark'}`}>
                  {edTeam.ids.length}/{MAX_TEAM}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-x-1.5 gap-y-3">
                {roster
                  .filter((p) => p.id !== edCaptain)
                  .map((p) => {
                    const on = edTeam.ids.includes(p.id);
                    const taken = teamOfPlayer(teams, p.id) === other(ed.team);
                    const full = !on && edTeam.ids.length >= MAX_TEAM;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={taken || full}
                        aria-pressed={on}
                        onClick={() => setTeams((t) => togglePlayer(t, ed.team, p.id))}
                        className="flex min-h-[78px] min-w-0 flex-col items-center gap-1 disabled:opacity-35"
                      >
                        <span className="relative">
                          <Avatar player={p} size={48} tone={on ? ed.team : 'N'} ring={on ? RING[ed.team] : ''} />
                          {on && (
                            <span className={`absolute -right-1.5 -bottom-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white text-xs font-extrabold text-white ${TEAM_BG[ed.team]}`}>
                              ✓
                            </span>
                          )}
                        </span>
                        <span className={`max-w-full truncate text-xs ${on ? 'font-extrabold' : 'font-semibold'}`}>{p.name}</span>
                        {taken && <span className="max-w-full truncate text-[11px] text-muted">{nm(other(ed.team))}</span>}
                      </button>
                    );
                  })}
              </div>
              {edTeam.ids.length >= MAX_TEAM && <Banner tone="grey">Team is full ({MAX_TEAM} including the captain). Tap a player to remove them.</Banner>}
              <button type="button" className={btn.primary} onClick={() => setEditing(null)}>
                Done
              </button>
            </>
          )}
        </Sheet>
      </Page>
    );
  }

  // ---------- Step 2: setup ----------
  const slot = (role: string, id: string | undefined, tone: TeamKey, onTap: () => void, disabled: boolean) => {
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
          {(['A', 'B'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setStep(1)} className={`flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-left text-white ${TEAM_BG[k]}`}>
              <span className="truncate font-display text-lg font-extrabold">{nm(k)}</span>
              <span className="truncate text-xs font-semibold text-white/90">
                {teams[k].ids.length} players · c {app.name(captainOf(teams[k]))}
              </span>
            </button>
          ))}
        </div>

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
            Innings ends after {overs} overs, or when {Math.max(1, teams.A.ids.length - 1)} ({nm('A')}) / {Math.max(1, teams.B.ids.length - 1)} ({nm('B')}) wickets fall.
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
            Openers{battingFirst ? ` (${nm(battingFirst)})` : ''} and first bowler{battingFirst ? ` (${nm(other(battingFirst))})` : ''}
          </Label>
          {slot('Striker', striker, battingFirst ?? 'A', () => setPicking('striker'), !battingFirst)}
          {slot('Non-striker', nonStriker, battingFirst ?? 'A', () => setPicking('nonStriker'), !battingFirst)}
          {slot('Opening bowler', bowler, battingFirst ? other(battingFirst) : 'B', () => setPicking('bowler'), !battingFirst)}
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
          tone={picking === 'bowler' ? (battingFirst ? other(battingFirst) : 'B') : (battingFirst ?? 'A')}
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
