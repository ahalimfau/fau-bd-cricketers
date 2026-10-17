// Display helpers shared by the scoring pad, viewer, scorecard and home.

import { otherTeam, teamOf } from '../engine/replay';
import type { BatterStats, InningsState, MatchMeta, MatchState, TeamKey, WicketHow } from '../engine/types';

export function teamName(meta: MatchMeta, t: TeamKey): string {
  return teamOf(meta, t).name;
}

export function matchTitle(meta: MatchMeta): string {
  return `${meta.teamA.name} v ${meta.teamB.name}`;
}

export function scoreText(inn: InningsState): string {
  return `${inn.runs}/${inn.wickets}`;
}

export function rate(runs: number, balls: number): string {
  return balls === 0 ? '0.00' : ((runs * 6) / balls).toFixed(2);
}

export function sr(runs: number, balls: number): string {
  return balls === 0 ? '–' : ((runs * 100) / balls).toFixed(1);
}

export function plural(n: number, w: string, ws = `${w}s`): string {
  return `${n} ${n === 1 ? w : ws}`;
}

/** "Lions need 33 off 16 balls", "Tigers batting", "Innings break", or the result. */
export function situation(meta: MatchMeta, s: MatchState): string {
  if (s.complete) return s.result?.text ?? 'Match over';
  const [i1, i2] = s.innings;
  if (s.current === 1) {
    return i1.started ? `${teamName(meta, i1.battingTeam)} batting first` : 'About to start';
  }
  const chasing = teamName(meta, i2.battingTeam);
  const target = i2.target ?? i1.runs + 1;
  if (!i2.started) return `Innings break · ${chasing} need ${target} to win`;
  const need = target - i2.runs;
  const left = meta.oversPerInnings * 6 - i2.legalBalls;
  return `${chasing} need ${plural(need, 'run')} off ${plural(left, 'ball')}`;
}

export function requiredRate(meta: MatchMeta, s: MatchState): string | null {
  const i2 = s.innings[1];
  if (s.current !== 2 || !i2.started || s.complete || i2.target === undefined) return null;
  const left = meta.oversPerInnings * 6 - i2.legalBalls;
  if (left <= 0) return null;
  return rate(i2.target - i2.runs, left);
}

export const HOW_LABEL: Record<WicketHow, string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  stumped: 'Stumped',
  hitwicket: 'Hit wicket',
  runout: 'Run out',
  // Soft hyphen so it can break inside a narrow button.
  obstructing: 'Obstruct­ing',
  hitballtwice: 'Hit ball twice',
};

export function dismissalText(b: BatterStats, name: (id?: string) => string): string {
  if (b.retired && !b.out) return 'retired not out';
  if (!b.out || !b.dismissal) return 'not out';
  const d = b.dismissal;
  const bw = d.bowlerId ? name(d.bowlerId) : '';
  switch (d.how) {
    case 'bowled':
      return `b ${bw}`;
    case 'caught':
      return d.fielderId && d.fielderId === d.bowlerId ? `c & b ${bw}` : `c ${d.fielderId ? name(d.fielderId) : '?'} b ${bw}`;
    case 'lbw':
      return `lbw b ${bw}`;
    case 'stumped':
      return `st ${d.fielderId ? name(d.fielderId) : '?'} b ${bw}`;
    case 'hitwicket':
      return `hit wicket b ${bw}`;
    case 'runout':
      return d.fielderId ? `run out (${name(d.fielderId)})` : 'run out';
    case 'obstructing':
      return 'obstructing the field';
    case 'hitballtwice':
      return 'hit the ball twice';
  }
}

/** Players of the batting side who can still come in to bat. */
export function availableBatters(meta: MatchMeta, inn: InningsState): string[] {
  const team = teamOf(meta, inn.battingTeam).playerIds;
  return team.filter((id) => {
    if (id === inn.strikerId || id === inn.nonStrikerId) return false;
    const b = inn.batters.find((x) => x.id === id);
    return !b || (b.retired && !b.out);
  });
}

export function battingIds(meta: MatchMeta, inn: InningsState): string[] {
  return teamOf(meta, inn.battingTeam).playerIds;
}

export function bowlingIds(meta: MatchMeta, inn: InningsState): string[] {
  return teamOf(meta, otherTeam(inn.battingTeam)).playerIds;
}

/** Bowler of the last over that has at least one ball (can't bowl the next one). */
export function lastOverBowler(inn: InningsState): string | undefined {
  for (let i = inn.overList.length - 1; i >= 0; i--) {
    const o = inn.overList[i];
    if (o.balls.length > 0) return o.bowlerId;
  }
  return undefined;
}

export function figures(inn: InningsState, id: string): string {
  const b = inn.bowlers.find((x) => x.id === id);
  if (!b) return '';
  return `${Math.floor(b.balls / 6)}.${b.balls % 6}-${b.maidens}-${b.runs}-${b.wickets}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
