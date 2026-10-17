import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import { appendEvent, deleteEvent, replaceEvent, undoLast } from './events';
import type { BallEvent, InningsNo, MatchEvent, MatchMeta, Wicket } from './types';

// Team A has 5 players (innings over at 4 wickets), Team B has 4 (over at 3).
const meta: MatchMeta = {
  oversPerInnings: 2,
  teamA: { name: 'Tigers', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
  teamB: { name: 'Lions', playerIds: ['b1', 'b2', 'b3', 'b4'] },
  battingFirst: 'A',
};

const run = (r: number, inn: InningsNo = 1): BallEvent => ({
  kind: 'ball',
  inn,
  runsBat: r,
  ...(r === 4 || r === 6 ? { boundary: true } : {}),
});
const wd = (runs = 0, inn: InningsNo = 1): BallEvent => ({ kind: 'ball', inn, runsBat: 0, extra: { type: 'wd', runs } });
const nb = (bat = 0, byes = 0, inn: InningsNo = 1, as: 'b' | 'lb' = 'b'): BallEvent => ({
  kind: 'ball',
  inn,
  runsBat: bat,
  boundary: bat === 4 || bat === 6,
  extra: { type: 'nb', runs: byes, nbRunsAs: as },
});
const lb = (runs: number, inn: InningsNo = 1): BallEvent => ({ kind: 'ball', inn, runsBat: 0, extra: { type: 'lb', runs } });
const out = (w: Wicket, runsBat = 0, inn: InningsNo = 1): BallEvent => ({ kind: 'ball', inn, runsBat, wicket: w });
const openers = (s: string, n: string, inn: InningsNo = 1): MatchEvent => ({ kind: 'setOpeners', inn, strikerId: s, nonStrikerId: n });
const bowl = (id: string, inn: InningsNo = 1): MatchEvent => ({ kind: 'setBowler', inn, bowlerId: id });

const start1: MatchEvent[] = [openers('a1', 'a2'), bowl('b1')];
const inn1 = (s: ReturnType<typeof replay>) => s.innings[0];
const bat = (s: ReturnType<typeof replay>, id: string, i = 0) => s.innings[i].batters.find((b) => b.id === id)!;
const bwl = (s: ReturnType<typeof replay>, id: string, i = 0) => s.innings[i].bowlers.find((b) => b.id === id)!;

describe('a normal over', () => {
  const s = replay(meta, [...start1, run(1), run(0), run(2), run(4), run(6), run(0)]);
  it('adds up runs and balls', () => {
    expect(inn1(s).runs).toBe(13);
    expect(inn1(s).overs).toBe('1.0');
    expect(inn1(s).completedOvers).toBe(1);
  });
  it('credits each batter and counts boundaries', () => {
    expect(bat(s, 'a1')).toMatchObject({ runs: 1, balls: 1 });
    expect(bat(s, 'a2')).toMatchObject({ runs: 12, balls: 5, fours: 1, sixes: 1 });
  });
  it('swaps strike at the end of the over and asks for a bowler', () => {
    expect(inn1(s).strikerId).toBe('a1');
    expect(s.needs).toBe('bowler');
  });
  it('charges the bowler', () => {
    expect(bwl(s, 'b1')).toMatchObject({ balls: 6, runs: 13, dots: 2, maidens: 0 });
  });
});

describe('extras', () => {
  it('wide that goes for 4 = 5 wides, all on the bowler, no ball faced', () => {
    const s = replay(meta, [...start1, wd(4)]);
    expect(inn1(s).runs).toBe(5);
    expect(inn1(s).extras.wd).toBe(5);
    expect(bwl(s, 'b1')).toMatchObject({ runs: 5, balls: 0, wides: 1 });
    expect(bat(s, 'a1').balls).toBe(0);
    expect(inn1(s).strikerId).toBe('a1');
    expect(inn1(s).overList[0].balls[0].label).toBe('5Wd');
    expect(inn1(s).overs).toBe('0.0');
  });

  it('no-ball hit for 4: batter gets 4 and a ball faced, bowler is charged 5', () => {
    const s = replay(meta, [...start1, nb(4)]);
    expect(inn1(s).runs).toBe(5);
    expect(bat(s, 'a1')).toMatchObject({ runs: 4, balls: 1, fours: 1 });
    expect(bwl(s, 'b1')).toMatchObject({ runs: 5, balls: 0, noBalls: 1 });
    expect(inn1(s).extras).toMatchObject({ nb: 1, total: 1 });
  });

  it('no-ball plus 2 byes: bowler charged only the 1 penalty', () => {
    const s = replay(meta, [...start1, nb(0, 2)]);
    expect(inn1(s).runs).toBe(3);
    expect(bwl(s, 'b1').runs).toBe(1);
    expect(inn1(s).extras).toMatchObject({ nb: 1, b: 2, total: 3 });
    expect(bat(s, 'a1')).toMatchObject({ runs: 0, balls: 1 });
    expect(inn1(s).strikerId).toBe('a1');
  });

  it('no-ball plus 1 leg bye goes to leg byes and rotates strike', () => {
    const s = replay(meta, [...start1, nb(0, 1, 1, 'lb')]);
    expect(inn1(s).extras).toMatchObject({ nb: 1, lb: 1 });
    expect(inn1(s).strikerId).toBe('a2');
  });

  it('bat runs entered on a wide are ignored with a warning', () => {
    const s = replay(meta, [...start1, { kind: 'ball', inn: 1, runsBat: 2, extra: { type: 'wd', runs: 0 } }]);
    expect(inn1(s).runs).toBe(1);
    expect(s.warnings.length).toBe(1);
  });
});

describe('strike rotation', () => {
  it('rotates on 1, 3 and a wide where they ran 1', () => {
    let s = replay(meta, [...start1, run(1)]);
    expect(inn1(s).strikerId).toBe('a2');
    s = replay(meta, [...start1, run(3)]);
    expect(inn1(s).strikerId).toBe('a2');
    s = replay(meta, [...start1, wd(1)]);
    expect(inn1(s).strikerId).toBe('a2');
    expect(inn1(s).runs).toBe(2);
  });
  it('a manual swap works', () => {
    const s = replay(meta, [...start1, { kind: 'swapStrike', inn: 1 }]);
    expect(inn1(s).strikerId).toBe('a2');
  });
});

describe('wickets', () => {
  it('caught: new batter takes strike, bowler and catcher credited', () => {
    const s = replay(meta, [...start1, run(1), out({ how: 'caught', outId: 'a2', fielderId: 'b2', newBatterId: 'a3' })]);
    expect(inn1(s).strikerId).toBe('a3');
    expect(inn1(s).nonStrikerId).toBe('a1');
    expect(bwl(s, 'b1').wickets).toBe(1);
    expect(s.fielding.b2.catches).toBe(1);
    expect(inn1(s).fow[0]).toMatchObject({ wicketNo: 1, runs: 1, overs: '0.2', playerId: 'a2' });
    expect(bat(s, 'a2').dismissal).toMatchObject({ how: 'caught', bowlerId: 'b1', fielderId: 'b2' });
  });

  it('caught on the last ball of the over: new batter ends up at the non-striker end', () => {
    const s = replay(meta, [
      ...start1,
      run(0), run(0), run(0), run(0), run(0),
      out({ how: 'caught', outId: 'a1', fielderId: 'b2', newBatterId: 'a3' }),
    ]);
    expect(inn1(s).strikerId).toBe('a2');
    expect(inn1(s).nonStrikerId).toBe('a3');
    expect(inn1(s).fow[0].overs).toBe('0.6');
    expect(bwl(s, 'b1').maidens).toBe(1); // a wicket maiden
  });

  it('run out of the non-striker after one completed run', () => {
    const w: Wicket = { how: 'runout', outId: 'a2', fielderId: 'b3', newBatterId: 'a3' };
    const s = replay(meta, [...start1, out(w, 1)]);
    expect(inn1(s).runs).toBe(1);
    expect(bat(s, 'a1').runs).toBe(1);
    // After crossing once a2 was at the striker's end; a3 replaces a2 there.
    expect(inn1(s).strikerId).toBe('a3');
    expect(inn1(s).nonStrikerId).toBe('a1');
    expect(bwl(s, 'b1').wickets).toBe(0);
    expect(s.fielding.b3.runOuts).toBe(1);
  });

  it('run out: scorer can say who faces next', () => {
    const w: Wicket = { how: 'runout', outId: 'a2', fielderId: 'b3', newBatterId: 'a3', nextStrikerId: 'a1' };
    const s = replay(meta, [...start1, out(w, 1)]);
    expect(inn1(s).strikerId).toBe('a1');
    expect(inn1(s).nonStrikerId).toBe('a3');
  });

  it('stumped off a wide: wide counts, bowler gets the wicket', () => {
    const s = replay(meta, [...start1, { kind: 'ball', inn: 1, runsBat: 0, extra: { type: 'wd', runs: 0 }, wicket: { how: 'stumped', outId: 'a1', fielderId: 'b4', newBatterId: 'a3' } }]);
    expect(inn1(s).runs).toBe(1);
    expect(inn1(s).wickets).toBe(1);
    expect(bwl(s, 'b1')).toMatchObject({ wickets: 1, wides: 1, runs: 1 });
  });

  it('caught off a no-ball is rejected', () => {
    const s = replay(meta, [...start1, { kind: 'ball', inn: 1, runsBat: 0, extra: { type: 'nb', runs: 0 }, wicket: { how: 'caught', outId: 'a1', newBatterId: 'a3' } }]);
    expect(inn1(s).wickets).toBe(0);
    expect(s.warnings[0]).toMatch(/isn't possible/);
  });

  it('asks for a new batter when the wicket had none', () => {
    const s = replay(meta, [...start1, out({ how: 'bowled', outId: 'a1' })]);
    expect(s.needs).toBe('newBatter');
  });
});

describe('innings and match endings', () => {
  // Innings 1: 2 overs, Tigers make 10.
  const firstInnings: MatchEvent[] = [
    ...start1,
    run(1), run(1), run(1), run(1), run(1), run(0),
    bowl('b2'),
    run(1), run(1), run(1), run(1), run(1), run(0),
  ];

  it('ends after the set number of overs', () => {
    const s = replay(meta, firstInnings);
    expect(inn1(s)).toMatchObject({ runs: 10, complete: true, endReason: 'overs' });
    expect(s.current).toBe(2);
    expect(s.needs).toBe('openers');
    expect(s.innings[1].target).toBe(11);
  });

  it('chase finishing mid-over: batting side wins by wickets, later balls ignored', () => {
    const s = replay(meta, [
      ...firstInnings,
      openers('b1', 'b2', 2),
      bowl('a1', 2),
      run(4, 2), run(6, 2), run(1, 2),
      run(1, 2),
    ]);
    expect(s.innings[1]).toMatchObject({ runs: 11, complete: true, endReason: 'target', overs: '0.3' });
    expect(s.complete).toBe(true);
    expect(s.result).toEqual({ winner: 'B', text: 'Lions won by 3 wickets' });
    expect(s.warnings.some((w) => /after the innings ended/.test(w))).toBe(true);
  });

  it('all out with uneven teams (4 players = 3 wickets)', () => {
    const s = replay(meta, [
      ...firstInnings,
      openers('b1', 'b2', 2),
      bowl('a1', 2),
      out({ how: 'bowled', outId: 'b1', newBatterId: 'b3' }, 0, 2),
      out({ how: 'bowled', outId: 'b3', newBatterId: 'b4' }, 0, 2),
      out({ how: 'lbw', outId: 'b4' }, 0, 2),
    ]);
    expect(s.innings[1]).toMatchObject({ wickets: 3, complete: true, endReason: 'allOut' });
    expect(s.result).toEqual({ winner: 'A', text: 'Tigers won by 10 runs' });
    expect(s.needs).toBe(null);
  });

  it('a tie', () => {
    const s = replay(meta, [
      ...firstInnings,
      openers('b1', 'b2', 2),
      bowl('a1', 2),
      run(4, 2), run(6, 2), run(0, 2), run(0, 2), run(0, 2), run(0, 2),
      bowl('a2', 2),
      run(0, 2), run(0, 2), run(0, 2), run(0, 2), run(0, 2), run(0, 2),
    ]);
    expect(s.result).toEqual({ winner: null, text: 'Match tied' });
  });

  it('maiden with leg byes still counts as a maiden', () => {
    const s = replay(meta, [...start1, run(0), lb(1), run(0), run(0), run(0), run(0)]);
    expect(bwl(s, 'b1').maidens).toBe(1);
    expect(inn1(s).runs).toBe(1);
  });
});

describe('undo, edit and delete', () => {
  it('undo after the over ends brings back the over and the previous bowler', () => {
    let evs: MatchEvent[] = [...start1, run(0), run(0), run(0), run(0), run(0), run(1), bowl('b2')];
    let s = replay(meta, evs);
    expect(s.innings[0].bowlerId).toBe('b2');
    expect(s.needs).toBe(null);
    evs = undoLast(evs); // remove the new bowler
    s = replay(meta, evs);
    expect(s.needs).toBe('bowler');
    expect(s.innings[0].bowlerId).toBe('b1');
    evs = undoLast(evs); // remove the 6th ball
    s = replay(meta, evs);
    expect(inn1(s).overs).toBe('0.5');
    expect(inn1(s).strikerId).toBe('a1');
    expect(s.needs).toBe(null);
  });

  it('undo of a wicket restores the batter with the same strike', () => {
    const before = [...start1, run(1)];
    const after = appendEvent(before, out({ how: 'caught', outId: 'a2', fielderId: 'b2', newBatterId: 'a3' }));
    const s = replay(meta, undoLast(after));
    expect(inn1(s).wickets).toBe(0);
    expect(inn1(s).strikerId).toBe('a2');
    expect(inn1(s).nonStrikerId).toBe('a1');
    expect(inn1(s).batters.map((b) => b.id)).toEqual(['a1', 'a2']);
    expect(s.fielding.b2).toBeUndefined();
  });

  it('undo across the innings break reopens the first innings', () => {
    const evs: MatchEvent[] = [
      ...start1,
      run(1), run(1), run(1), run(1), run(1), run(0),
      bowl('b2'),
      run(1), run(1), run(1), run(1), run(1), run(0),
      openers('b1', 'b2', 2),
    ];
    let s = replay(meta, undoLast(evs));
    expect(s.current).toBe(2);
    expect(s.needs).toBe('openers');
    s = replay(meta, undoLast(undoLast(evs)));
    expect(s.current).toBe(1);
    expect(inn1(s).complete).toBe(false);
    expect(inn1(s).overs).toBe('1.5');
    expect(s.needs).toBe(null);
  });

  it('editing a ball from 1 to 4 recalculates strike and every later ball', () => {
    const evs: MatchEvent[] = [...start1, run(1), run(2), run(1)];
    // As recorded: a1 takes 1, then a2 scores 2 and 1.
    const s0 = replay(meta, evs);
    expect(bat(s0, 'a1')).toMatchObject({ runs: 1, balls: 1 });
    expect(bat(s0, 'a2')).toMatchObject({ runs: 3, balls: 2 });
    const s = replay(meta, replaceEvent(evs, 2, run(4)));
    // now a1 hits 4 and keeps strike, so a1 also faces the next two balls
    expect(bat(s, 'a1')).toMatchObject({ runs: 7, balls: 3, fours: 1 });
    expect(bat(s, 'a2')).toMatchObject({ runs: 0, balls: 0 });
    expect(inn1(s).runs).toBe(7);
    expect(inn1(s).strikerId).toBe('a2');
  });

  it('deleting a ball', () => {
    const evs: MatchEvent[] = [...start1, run(1), wd(0), run(2)];
    const s = replay(meta, deleteEvent(evs, 3));
    expect(inn1(s).runs).toBe(3);
    expect(inn1(s).extras.wd).toBe(0);
    expect(bwl(s, 'b1').wides).toBe(0);
  });

  it('turning a legal ball into a wide in a finished over does not shift later overs', () => {
    const evs: MatchEvent[] = [
      ...start1,
      run(0), run(0), run(0), run(0), run(0), run(0),
      bowl('b2'),
      run(1), run(0),
    ];
    const s = replay(meta, replaceEvent(evs, 3, wd(0)));
    expect(s.innings[0].overList[1]).toMatchObject({ number: 2, bowlerId: 'b2', legalBalls: 2 });
    expect(s.innings[0].completedOvers).toBe(1);
    expect(s.innings[0].overs).toBe('1.2');
    expect(s.warnings.some((w) => /only 5 legal balls/.test(w))).toBe(true);
  });

  it('a ball after the over is complete, without a new bowler, is flagged', () => {
    const s = replay(meta, [...start1, run(0), run(0), run(0), run(0), run(0), run(0), run(0)]);
    expect(s.warnings.some((w) => /more than 6 legal balls/.test(w))).toBe(true);
  });

  it('the same bowler twice in a row is flagged', () => {
    const s = replay(meta, [...start1, run(0), run(0), run(0), run(0), run(0), run(0), bowl('b1')]);
    expect(s.warnings.some((w) => /two overs in a row/.test(w))).toBe(true);
  });
});
