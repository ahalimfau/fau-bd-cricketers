import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import { DEFAULT_AWARDS_CONFIG, playerMatchStats } from './awards';
import { battingAverage, bestText, careers, economyText, highestText, performanceLine, performances, type PlayedMatch } from './career';
import type { BallEvent, InningsNo, MatchEvent, MatchMeta } from './types';

const meta: MatchMeta = {
  oversPerInnings: 1,
  battingFirst: 'A',
  teamA: { name: 'Tigers', playerIds: ['a1', 'a2', 'a3'] },
  teamB: { name: 'Lions', playerIds: ['b1', 'b2', 'b3'] },
};
const run = (r: number, inn: InningsNo): BallEvent => ({ kind: 'ball', inn, runsBat: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) });

// Match 1: a1 makes 10 not out; b1 takes 1 wicket for 10. Lions chase: b1 6 not out, a2 bowls.
const m1: MatchEvent[] = [
  { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
  { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
  run(4, 1), run(6, 1), run(0, 1), run(0, 1), run(0, 1),
  { kind: 'ball', inn: 1, runsBat: 0, wicket: { how: 'caught', outId: 'a1', fielderId: 'b2', newBatterId: 'a3' } },
  { kind: 'setOpeners', inn: 2, strikerId: 'b1', nonStrikerId: 'b2' },
  { kind: 'setBowler', inn: 2, bowlerId: 'a2' },
  run(6, 2), run(0, 2), run(0, 2), run(0, 2), run(0, 2), run(0, 2),
];
// Match 2: a1 out for 0; b1 takes 2 wickets for 3.
const m2: MatchEvent[] = [
  { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
  { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
  { kind: 'ball', inn: 1, runsBat: 0, wicket: { how: 'bowled', outId: 'a1', newBatterId: 'a3' } },
  run(3, 1),
  { kind: 'ball', inn: 1, runsBat: 0, wicket: { how: 'bowled', outId: 'a2' } },
];

const played: PlayedMatch[] = [
  { id: 'm1', meta, state: replay(meta, m1), createdAt: 1000 },
  { id: 'm2', meta, state: replay(meta, m2), createdAt: 2000 },
];
const c = careers(played);

describe('careers', () => {
  it('counts matches from the team lists, even for players who did nothing', () => {
    expect(c.get('b3')?.matches).toBe(2);
    expect(c.get('a1')?.matches).toBe(2);
  });

  it('batting: runs, innings, not outs, highest, average, ducks', () => {
    const a1 = c.get('a1')!;
    // m1: 10 out (caught off the 6th ball); m2: 0 out
    expect(a1).toMatchObject({ innings: 2, notOuts: 0, runs: 10, highest: 10, highestNotOut: false, ducks: 1, fours: 1, sixes: 1 });
    expect(battingAverage(a1)).toBe('5.0');
    expect(highestText(a1)).toBe('10');
    const b1 = c.get('b1')!;
    expect(b1).toMatchObject({ innings: 1, notOuts: 1, runs: 6, highestNotOut: true });
    expect(battingAverage(b1)).toBe('–');
    expect(highestText(b1)).toBe('6*');
  });

  it('bowling: wickets, economy and best figures', () => {
    const b1 = c.get('b1')!;
    // m1: 1-10 off 6 balls; m2: 2-3 off 3 balls
    expect(b1).toMatchObject({ wickets: 3, bowlRuns: 13, bowlBalls: 9 });
    expect(bestText(b1)).toBe('2-3');
    expect(economyText(b1)).toBe('8.67');
    expect(bestText(c.get('a3')!)).toBe('–');
  });

  it('fielding: catches counted for the catcher', () => {
    expect(c.get('b2')?.catches).toBe(1);
  });
});

describe('performances', () => {
  it('lists each match the player was picked for, newest first, with titles', () => {
    const p = performances(played, 'a1', DEFAULT_AWARDS_CONFIG);
    expect(p.map((x) => x.match.id)).toEqual(['m2', 'm1']);
    expect(p[0].titles.some((t) => t.key === 'hasherDim')).toBe(true);
    expect(performances(played, 'zz', DEFAULT_AWARDS_CONFIG)).toEqual([]);
  });

  it('formats a one-line summary', () => {
    const s1 = playerMatchStats(played[0].state);
    expect(performanceLine(s1.a1)).toBe('10 (6)');
    expect(performanceLine(s1.b1)).toBe('6* (6) · 1-10 (1.0)');
    expect(performanceLine(s1.a2)).toBe('0* (0) · 0-6 (1.0)');
    expect(performanceLine(null)).toBe('Did not bat or bowl');
  });
});
