import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import {
  DEFAULT_AWARDS_CONFIG,
  computeAwards,
  matchEconomy,
  playerMatchStats,
  seasonTitleCounts,
  shahinScore,
  titleName,
  type Award,
  type TitleKey,
} from './awards';
import type { BallEvent, InningsNo, MatchEvent, MatchMeta, Oops, Wicket } from './types';

const meta: MatchMeta = {
  oversPerInnings: 2,
  teamA: { name: 'Tigers', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
  teamB: { name: 'Lions', playerIds: ['b1', 'b2', 'b3', 'b4'] },
  battingFirst: 'A',
};

const run = (r: number, inn: InningsNo, oops?: Oops[]): BallEvent => ({
  kind: 'ball',
  inn,
  runsBat: r,
  ...(r === 4 || r === 6 ? { boundary: true } : {}),
  ...(oops ? { oops } : {}),
});
const wd = (inn: InningsNo): BallEvent => ({ kind: 'ball', inn, runsBat: 0, extra: { type: 'wd', runs: 0 } });
const out = (w: Wicket, inn: InningsNo): BallEvent => ({ kind: 'ball', inn, runsBat: 0, wicket: w });

// Hand-checked match:
// Innings 1 (Tigers 17/1): b1 goes for 16 (15 off the bat + 1 wide); a1 makes 16 off 7, b2 bowls 1-run over and bowls a2 for a duck.
// b3 drops two catches, b1 drops one.
// Innings 2 (Lions 8/1): a1 concedes 2, a2 concedes 6 and bowls b2. a3 misfields one for four.
const events: MatchEvent[] = [
  { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
  { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
  run(4, 1, [{ type: 'drop', fielderId: 'b3' }]),
  run(6, 1),
  wd(1),
  run(4, 1, [{ type: 'drop', fielderId: 'b3' }]),
  run(1, 1),
  run(0, 1, [{ type: 'drop', fielderId: 'b1' }]),
  run(0, 1),
  { kind: 'setBowler', inn: 1, bowlerId: 'b2' },
  run(0, 1),
  run(0, 1),
  run(1, 1),
  run(0, 1),
  run(0, 1),
  out({ how: 'bowled', outId: 'a2' }, 1),
  { kind: 'setOpeners', inn: 2, strikerId: 'b1', nonStrikerId: 'b2' },
  { kind: 'setBowler', inn: 2, bowlerId: 'a1' },
  run(1, 2),
  run(1, 2),
  run(0, 2),
  run(0, 2),
  run(0, 2),
  run(0, 2),
  { kind: 'setBowler', inn: 2, bowlerId: 'a2' },
  run(2, 2),
  run(2, 2, [{ type: 'misfield4', fielderId: 'a3' }]),
  run(2, 2),
  run(0, 2),
  run(0, 2),
  out({ how: 'bowled', outId: 'b2' }, 2),
];

const state = replay(meta, events);
const awards = computeAwards(state);
const byKey = (k: TitleKey) => awards.find((a) => a.key === k);

describe('the hand-checked match itself', () => {
  it('scores as expected', () => {
    expect(state.warnings).toEqual([]);
    expect(state.innings[0]).toMatchObject({ runs: 17, wickets: 1, complete: true });
    expect(state.innings[1]).toMatchObject({ runs: 8, wickets: 1, complete: true });
    expect(state.result?.text).toBe('Tigers won by 9 runs');
  });
});

describe('titles', () => {
  it('Fatakeshto: most runs, with the boundary count', () => {
    expect(byKey('fatakeshto')).toMatchObject({ playerIds: ['a1'], stat: '16 off 7 · 2 fours, 1 six' });
  });

  it('Game Changer: wickets tie broken by better economy', () => {
    // b2 and a2 both took 1 wicket; b2 conceded 1 an over, a2 conceded 6.
    expect(byKey('gameChanger')).toMatchObject({ playerIds: ['b2'], stat: '1.0-0-1-1 · economy 1.00' });
  });

  it('Kipta: falls back to the 1-over minimum when nobody bowled 2 overs', () => {
    expect(byKey('kipta')).toMatchObject({ playerIds: ['b2'], detail: 'Minimum 1.0 overs' });
    expect(byKey('kipta')?.stat).toBe('1.0-0-1-1 · economy 1.00');
  });

  it('Kipta: uses the 2-over minimum when someone qualifies', () => {
    const cfg = { ...DEFAULT_AWARDS_CONFIG, kiptaMinBalls: 6 };
    expect(computeAwards(state, cfg).find((a) => a.key === 'kipta')?.detail).toBe('Minimum 1.0 overs');
  });

  it('Miss: most dropped catches', () => {
    expect(byKey('miss')).toMatchObject({ playerIds: ['b3'], stat: '2 dropped catches' });
  });

  it('Shahin: low score + expensive bowling + fielding mistakes − wickets, across both teams', () => {
    const stats = Object.values(playerMatchStats(state));
    const econ = matchEconomy(stats);
    // 25 runs charged to bowlers off 24 legal balls
    expect(econ).toBeCloseTo(6.25, 10);
    const score = (id: string) => shahinScore(stats.find((s) => s.id === id)!, econ, DEFAULT_AWARDS_CONFIG);
    // b1: 16 − 6.25 = 9.75 above economy, + 6 for one drop, 1 not out (no batting penalty)
    expect(score('b1')).toBeCloseTo(15.75, 10);
    // b3: never bowled or batted, but dropped 2 catches: 2 × 6
    expect(score('b3')).toBe(12);
    // a2: out for 0 (par 10 → 10 points), bowled under economy, 1 wicket (−8)
    expect(score('a2')).toBe(2);
    // b2: out for 7 (3 points) but 1 wicket (−8): never below 0
    expect(score('b2')).toBe(0);
    // a3: one misfield for four
    expect(score('a3')).toBe(4);
    expect(byKey('shahin')).toMatchObject({ playerIds: ['b1'], stat: '1 not out · 1.0-0-16-0 · 1 drop' });
    expect(byKey('shahin')?.detail).toBe('Disaster score 15.8 = 9.8 runs above match economy (6.25) + 6 × 1 drop');
  });

  it('Shahin can go to a player who never bowled', () => {
    // Default weights: b1 15.75 beats b3 12 (2 drops × 6).
    expect(byKey('shahin')?.playerIds).toEqual(['b1']);
    // Raise the drop weight: b3 2 × 10 = 20 beats b1 9.75 + 10 = 19.75.
    const cfg = structuredClone(DEFAULT_AWARDS_CONFIG);
    cfg.shahinWeights.drop = 10;
    expect(computeAwards(state, cfg).find((x) => x.key === 'shahin')).toMatchObject({ playerIds: ['b3'], stat: '2 drops' });
  });

  it('Shahin wicket credit is configurable', () => {
    const stats = Object.values(playerMatchStats(state));
    const econ = matchEconomy(stats);
    const a2 = stats.find((s) => s.id === 'a2')!;
    const cfg = structuredClone(DEFAULT_AWARDS_CONFIG);
    cfg.shahinWeights.wicket = 0;
    expect(shahinScore(a2, econ, cfg)).toBe(10);
    cfg.shahinWeights.batPar = 0;
    expect(shahinScore(a2, econ, cfg)).toBe(0);
  });

  it('Shahin is still awarded when nobody made a fielding mistake', () => {
    const clean = events.map((e) => (e.kind === 'ball' && e.oops ? { ...e, oops: undefined } : e));
    const a = computeAwards(replay(meta, clean));
    expect(a.find((x) => x.key === 'shahin')?.playerIds).toEqual(['b1']);
    expect(a.find((x) => x.key === 'miss')).toBeUndefined();
  });

  it('Mr. Wide, Baje Fielder and Golden Duck', () => {
    expect(byKey('wideBhai')).toMatchObject({ playerIds: ['b1'], stat: '1 wide' });
    // Baje Fielder counts boundaries leaked AND dropped catches: b3 has 2 drops, a3 and b1 have 1 each.
    expect(byKey('chalni')).toMatchObject({ playerIds: ['b3'], stat: '2 dropped catches' });
    expect(byKey('hasherDim')).toMatchObject({ playerIds: ['a2'] });
  });

  it('Baje Fielder tie goes to whoever leaked more boundaries', () => {
    const fewer = events.map((e, i) => (i === 5 && e.kind === 'ball' ? { ...e, oops: undefined } : e)); // b3 now has 1 drop
    const a = computeAwards(replay(meta, fewer));
    // b3: 1 drop, b1: 1 drop, a3: 1 boundary leaked → a3 wins the tie
    expect(a.find((x) => x.key === 'chalni')).toMatchObject({ playerIds: ['a3'], stat: '1 boundary leaked' });
  });

  it('a title with nothing to show is left out', () => {
    expect(byKey('noBallNawab')).toBeUndefined();
  });

  it('disabled titles and renamed labels follow the settings', () => {
    const cfg = structuredClone(DEFAULT_AWARDS_CONFIG);
    cfg.titles.miss.enabled = false;
    cfg.titles.kipta.label = 'Kipte';
    const a = computeAwards(state, cfg);
    expect(a.find((x) => x.key === 'miss')).toBeUndefined();
    expect(a.find((x) => x.key === 'kipta')?.label).toBe('Kipte');
  });

  it('a full tie on every tie-break is shared', () => {
    // a1 and a2 both concede exactly 0 in a one-over-each innings
    const m: MatchEvent[] = [
      { kind: 'setOpeners', inn: 1, strikerId: 'b1', nonStrikerId: 'b2' },
      { kind: 'setBowler', inn: 1, bowlerId: 'a1' },
      run(0, 1), run(0, 1), run(0, 1), run(0, 1), run(0, 1), run(0, 1),
      { kind: 'setBowler', inn: 1, bowlerId: 'a2' },
      run(0, 1), run(0, 1), run(0, 1), run(0, 1), run(0, 1), run(0, 1),
    ];
    const s = replay({ ...meta, battingFirst: 'B' }, m);
    const kipta = computeAwards(s).find((a) => a.key === 'kipta');
    expect(kipta?.playerIds.sort()).toEqual(['a1', 'a2']);
  });
});

describe('Fatakeshto counts only runs off the bat', () => {
  it('a six off a no-ball is the batter’s; wides and the no-ball penalty are not', () => {
    const m: MatchEvent[] = [
      { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
      { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
      { kind: 'ball', inn: 1, runsBat: 6, boundary: true, extra: { type: 'nb', runs: 0 } }, // a1 +6, team +7
      { kind: 'ball', inn: 1, runsBat: 0, extra: { type: 'wd', runs: 4 } }, // 5 wides, nobody's runs
      run(1, 1), // a1 7, strike to a2
      run(4, 1), // a2 4
      { kind: 'ball', inn: 1, runsBat: 0, extra: { type: 'nb', runs: 2, nbRunsAs: 'b' } }, // 3 extras, not a2's
    ];
    const s = replay(meta, m);
    expect(s.innings[0].runs).toBe(7 + 5 + 1 + 4 + 3);
    const f = computeAwards(s).find((a) => a.key === 'fatakeshto');
    // a1 faced the no-ball and one legal ball: 7 off 2
    expect(f).toMatchObject({ playerIds: ['a1'], stat: '7 off 2 · 1 six' });
  });

  it('works mid-match and looks at both teams', () => {
    const half = events.slice(0, 20); // into the 2nd innings
    const f = computeAwards(replay(meta, half)).find((a) => a.key === 'fatakeshto');
    expect(f?.playerIds).toEqual(['a1']);
  });
});

describe('Game Changer and Kipta on hand-made figures', () => {
  const bowl = (id: string, balls: number, runs: number, wickets: number) => ({ id, balls, runs, wickets, wides: 0, noBalls: 0, maidens: 0, dots: 0 });
  const fake = (bowlers: ReturnType<typeof bowl>[]) =>
    ({ innings: [{ batters: [], bowlers }, { batters: [], bowlers: [] }], fielding: {} }) as unknown as Parameters<typeof computeAwards>[0];

  it('Game Changer: same wickets → better economy wins, even with more runs conceded', () => {
    // x: 2 for 12 off 2 overs (economy 6); y: 2 for 10 off 1 over (economy 10)
    const a = computeAwards(fake([bowl('x', 12, 12, 2), bowl('y', 6, 10, 2)]));
    expect(a.find((t) => t.key === 'gameChanger')?.playerIds).toEqual(['x']);
  });

  it('Game Changer: more wickets beats economy', () => {
    const a = computeAwards(fake([bowl('x', 12, 30, 3), bowl('y', 12, 6, 2)]));
    expect(a.find((t) => t.key === 'gameChanger')?.playerIds).toEqual(['x']);
  });

  it('Kipta: best economy among bowlers with enough balls', () => {
    const a = computeAwards(fake([bowl('x', 12, 12, 0), bowl('y', 12, 9, 0), bowl('z', 6, 1, 0)]));
    // z bowled only 1 over, below the 2-over minimum while others qualify
    expect(a.find((t) => t.key === 'kipta')?.playerIds).toEqual(['y']);
  });
});

describe('titleName', () => {
  it('adds "of the day" to Hall of Shame titles only', () => {
    expect(titleName('shahin', 'Shahin')).toBe('Shahin of the day');
    expect(titleName('miss', 'Ashraful')).toBe('Ashraful of the day');
    expect(titleName('wideBhai', 'Mr. Wide of the day')).toBe('Mr. Wide of the day');
    expect(titleName('fatakeshto', 'Fatakeshto')).toBe('Fatakeshto');
    expect(titleName('miss', 'Ashraful', false)).toBe('Ashraful');
  });
});

describe('season', () => {
  it('counts titles across matches', () => {
    const m1: Award[] = [
      { key: 'miss', label: 'Miss', playerIds: ['b3'], stat: '' },
      { key: 'hasherDim', label: 'Hasher Dim', playerIds: ['a2', 'a4'], stat: '' },
    ];
    const m2: Award[] = [{ key: 'miss', label: 'Miss', playerIds: ['b3'], stat: '' }];
    const counts = seasonTitleCounts([m1, m2]);
    expect(counts[0]).toEqual({ key: 'miss', playerId: 'b3', count: 2 });
    expect(counts).toHaveLength(3);
  });
});
