import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import {
  DEFAULT_AWARDS_CONFIG,
  computeAwards,
  matchEconomy,
  playerMatchStats,
  seasonTitleCounts,
  shahinScore,
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

  it('Game Changer: wickets tie broken by fewer runs conceded', () => {
    // b2 and a2 both took 1 wicket; b2 conceded 1, a2 conceded 6.
    expect(byKey('gameChanger')).toMatchObject({ playerIds: ['b2'], stat: '1.0-0-1-1' });
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

  it('Shahin: disaster score = runs above match economy + 6 per drop', () => {
    const stats = Object.values(playerMatchStats(state));
    const econ = matchEconomy(stats);
    // 25 runs charged to bowlers off 24 legal balls
    expect(econ).toBeCloseTo(6.25, 10);
    const b1 = stats.find((s) => s.id === 'b1')!;
    // 16 - 6.25 = 9.75 excess, + 6 for one drop
    expect(shahinScore(b1, econ, DEFAULT_AWARDS_CONFIG)).toBeCloseTo(15.75, 10);
    expect(byKey('shahin')).toMatchObject({ playerIds: ['b1'], stat: '1.0-0-16-0 and 1 drop' });
    expect(byKey('shahin')?.detail).toMatch(/^Disaster score 15\.8 = 9\.8 runs above match economy \(6\.25\) \+ 6 × 1 drop$/);
  });

  it('Shahin is still awarded when nobody made a fielding mistake', () => {
    const clean = events.map((e) => (e.kind === 'ball' && e.oops ? { ...e, oops: undefined } : e));
    const a = computeAwards(replay(meta, clean));
    expect(a.find((x) => x.key === 'shahin')?.playerIds).toEqual(['b1']);
    expect(a.find((x) => x.key === 'miss')).toBeUndefined();
  });

  it('Wide Bhai, Chalni and Hasher Dim', () => {
    expect(byKey('wideBhai')).toMatchObject({ playerIds: ['b1'], stat: '1 wide' });
    expect(byKey('chalni')).toMatchObject({ playerIds: ['a3'] });
    expect(byKey('hasherDim')).toMatchObject({ playerIds: ['a2'] });
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
