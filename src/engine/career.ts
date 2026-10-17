// Career and season numbers for each player, rebuilt from the ball-by-ball
// lists of finished matches (nothing is stored, so nothing can drift).

import { computeAwards, playerMatchStats, type Award, type AwardsConfig, type PlayerMatchStats } from './awards';
import type { MatchMeta, MatchState, PlayerId, TeamKey } from './types';

export interface PlayedMatch {
  id: string;
  meta: MatchMeta;
  state: MatchState;
  createdAt: number;
}

export interface Career {
  id: PlayerId;
  /** Matches where the player was picked in a team. */
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  highest: number;
  highestNotOut: boolean;
  fours: number;
  sixes: number;
  ducks: number;
  bowlBalls: number;
  bowlRuns: number;
  wickets: number;
  /** Best bowling in one match: most wickets, then fewest runs. */
  best: { wickets: number; runs: number } | null;
  maidens: number;
  wides: number;
  noBalls: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  drops: number;
  boundariesLeaked: number;
  missedRunOuts: number;
  overthrows: number;
}

function empty(id: PlayerId): Career {
  return {
    id,
    matches: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    balls: 0,
    highest: 0,
    highestNotOut: false,
    fours: 0,
    sixes: 0,
    ducks: 0,
    bowlBalls: 0,
    bowlRuns: 0,
    wickets: 0,
    best: null,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    drops: 0,
    boundariesLeaked: 0,
    missedRunOuts: 0,
    overthrows: 0,
  };
}

export function teamIn(meta: MatchMeta, id: PlayerId): TeamKey | null {
  if (meta.teamA.playerIds.includes(id)) return 'A';
  if (meta.teamB.playerIds.includes(id)) return 'B';
  return null;
}

export function careers(list: PlayedMatch[]): Map<PlayerId, Career> {
  const out = new Map<PlayerId, Career>();
  const get = (id: PlayerId) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = empty(id)));
    return c;
  };
  for (const m of list) {
    for (const id of [...m.meta.teamA.playerIds, ...m.meta.teamB.playerIds]) get(id).matches += 1;
    for (const s of Object.values(playerMatchStats(m.state))) {
      const c = get(s.id);
      if (s.batted) {
        c.innings += 1;
        if (!s.out) c.notOuts += 1;
        if (s.batRuns > c.highest || (s.batRuns === c.highest && !s.out && !c.highestNotOut)) {
          c.highest = s.batRuns;
          c.highestNotOut = !s.out;
        }
      }
      c.runs += s.batRuns;
      c.balls += s.batBalls;
      c.fours += s.fours;
      c.sixes += s.sixes;
      if (s.duck) c.ducks += 1;
      c.bowlBalls += s.bowlBalls;
      c.bowlRuns += s.bowlRuns;
      c.wickets += s.wickets;
      if (s.bowlBalls > 0 && (!c.best || s.wickets > c.best.wickets || (s.wickets === c.best.wickets && s.bowlRuns < c.best.runs))) {
        c.best = { wickets: s.wickets, runs: s.bowlRuns };
      }
      c.maidens += s.maidens;
      c.wides += s.wides;
      c.noBalls += s.noBalls;
      c.catches += s.catches;
      c.runOuts += s.runOuts;
      c.stumpings += s.stumpings;
      c.drops += s.drops;
      c.boundariesLeaked += s.misfield4 + s.misfield6;
      c.missedRunOuts += s.missedRunOuts;
      c.overthrows += s.overthrows;
    }
  }
  return out;
}

export function battingAverage(c: Career): string {
  const outs = c.innings - c.notOuts;
  return outs === 0 ? '–' : (c.runs / outs).toFixed(1);
}

export function strikeRate(c: Pick<Career, 'runs' | 'balls'>): string {
  return c.balls === 0 ? '–' : ((c.runs * 100) / c.balls).toFixed(0);
}

export function economyText(c: Pick<Career, 'bowlRuns' | 'bowlBalls'>): string {
  return c.bowlBalls === 0 ? '–' : ((c.bowlRuns * 6) / c.bowlBalls).toFixed(2);
}

export function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function highestText(c: Career): string {
  return c.innings === 0 ? '–' : `${c.highest}${c.highestNotOut ? '*' : ''}`;
}

export function bestText(c: Career): string {
  return c.best ? `${c.best.wickets}-${c.best.runs}` : '–';
}

// ---------- One player's matches ----------

export interface MatchPerformance {
  match: PlayedMatch;
  team: TeamKey;
  stats: PlayerMatchStats | null;
  titles: Award[];
}

/** Every finished match the player was picked for, newest first. */
export function performances(list: PlayedMatch[], id: PlayerId, cfg: AwardsConfig): MatchPerformance[] {
  const out: MatchPerformance[] = [];
  for (const m of list) {
    const team = teamIn(m.meta, id);
    if (!team) continue;
    const stats: PlayerMatchStats | null = playerMatchStats(m.state)[id] ?? null;
    const titles = computeAwards(m.state, cfg).filter((a) => a.playerIds.includes(id));
    out.push({ match: m, team, stats, titles });
  }
  return out.sort((a, b) => b.match.createdAt - a.match.createdAt);
}

/** e.g. "32* (20) · 2-14 (3.0)" or "DNB · 0-21 (2.0)". */
export function performanceLine(s: PlayerMatchStats | null): string {
  if (!s) return 'Did not bat or bowl';
  const bat = s.batted ? `${s.batRuns}${s.out ? '' : '*'} (${s.batBalls})` : 'DNB';
  const bowl = s.bowlBalls > 0 ? ` · ${s.wickets}-${s.bowlRuns} (${oversText(s.bowlBalls)})` : '';
  return bat + bowl;
}
