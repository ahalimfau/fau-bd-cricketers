import type { MatchState, PlayerId } from './types';

export type TitleKey =
  | 'fatakeshto'
  | 'gameChanger'
  | 'kipta'
  | 'miss'
  | 'shahin'
  | 'wideBhai'
  | 'noBallNawab'
  | 'chalni'
  | 'hasherDim';

export interface TitleConfig {
  label: string;
  enabled: boolean;
}

export interface AwardsConfig {
  titles: Record<TitleKey, TitleConfig>;
  shahinWeights: { drop: number; boundaryMisfield: number; otherOops: number };
  /** Kipta needs at least this many legal balls bowled... */
  kiptaMinBalls: number;
  /** ...falling back to this if nobody reached kiptaMinBalls. */
  kiptaFallbackBalls: number;
  /** Shahin candidates must have bowled at least this many legal balls. */
  shahinMinBalls: number;
}

export const TITLE_ORDER: TitleKey[] = [
  'fatakeshto',
  'gameChanger',
  'kipta',
  'shahin',
  'miss',
  'wideBhai',
  'noBallNawab',
  'chalni',
  'hasherDim',
];

/** Heroes are shown first on the awards page; the rest is the Hall of Shame. */
export const HERO_TITLES: ReadonlySet<TitleKey> = new Set<TitleKey>(['fatakeshto', 'gameChanger', 'kipta']);

export const DEFAULT_AWARDS_CONFIG: AwardsConfig = {
  titles: {
    fatakeshto: { label: 'Fatakeshto', enabled: true },
    gameChanger: { label: 'Game Changer', enabled: true },
    kipta: { label: 'Kipta', enabled: true },
    shahin: { label: 'Shahin', enabled: true },
    miss: { label: 'Miss', enabled: true },
    wideBhai: { label: 'Wide Bhai', enabled: true },
    noBallNawab: { label: 'No-Ball Nawab', enabled: true },
    chalni: { label: 'Chalni', enabled: true },
    hasherDim: { label: 'Hasher Dim', enabled: true },
  },
  shahinWeights: { drop: 6, boundaryMisfield: 4, otherOops: 2 },
  kiptaMinBalls: 12,
  kiptaFallbackBalls: 6,
  shahinMinBalls: 6,
};

export const TITLE_RULES: Record<TitleKey, string> = {
  fatakeshto: 'Most runs',
  gameChanger: 'Most wickets',
  kipta: 'Lowest economy',
  shahin: 'Expensive bowler + bad fielder',
  miss: 'Most dropped catches',
  wideBhai: 'Most wides',
  noBallNawab: 'Most no-balls',
  chalni: 'Most boundaries leaked',
  hasherDim: 'Out for 0',
};

export interface PlayerMatchStats {
  id: PlayerId;
  batRuns: number;
  batBalls: number;
  fours: number;
  sixes: number;
  batted: boolean;
  out: boolean;
  duck: boolean;
  bowlBalls: number;
  bowlRuns: number;
  wickets: number;
  wides: number;
  noBalls: number;
  maidens: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  drops: number;
  misfield4: number;
  misfield6: number;
  missedRunOuts: number;
  overthrows: number;
}

export function emptyStats(id: PlayerId): PlayerMatchStats {
  return {
    id,
    batRuns: 0,
    batBalls: 0,
    fours: 0,
    sixes: 0,
    batted: false,
    out: false,
    duck: false,
    bowlBalls: 0,
    bowlRuns: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    maidens: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    drops: 0,
    misfield4: 0,
    misfield6: 0,
    missedRunOuts: 0,
    overthrows: 0,
  };
}

export function playerMatchStats(state: MatchState): Record<PlayerId, PlayerMatchStats> {
  const out: Record<PlayerId, PlayerMatchStats> = {};
  const get = (id: PlayerId) => (out[id] ??= emptyStats(id));
  for (const inn of state.innings) {
    for (const b of inn.batters) {
      const s = get(b.id);
      s.batted = true;
      s.batRuns += b.runs;
      s.batBalls += b.balls;
      s.fours += b.fours;
      s.sixes += b.sixes;
      if (b.out) {
        s.out = true;
        if (b.runs === 0) s.duck = true;
      }
    }
    for (const b of inn.bowlers) {
      const s = get(b.id);
      s.bowlBalls += b.balls;
      s.bowlRuns += b.runs;
      s.wickets += b.wickets;
      s.wides += b.wides;
      s.noBalls += b.noBalls;
      s.maidens += b.maidens;
    }
  }
  for (const f of Object.values(state.fielding)) {
    const s = get(f.id);
    s.catches += f.catches;
    s.runOuts += f.runOuts;
    s.stumpings += f.stumpings;
    s.drops += f.drops;
    s.misfield4 += f.misfield4;
    s.misfield6 += f.misfield6;
    s.missedRunOuts += f.missedRunOuts;
    s.overthrows += f.overthrows;
  }
  return out;
}

export interface Award {
  key: TitleKey;
  label: string;
  playerIds: PlayerId[];
  /** One-line stat, e.g. "58 off 34". */
  stat: string;
  /** Extra explanation (used for Shahin's formula). */
  detail?: string;
}

type Score = (s: PlayerMatchStats) => number;

/** Players with the highest score, broken by each tie-breaker in turn (higher wins). */
export function pickTop(cands: PlayerMatchStats[], primary: Score, ...tiebreaks: Score[]): PlayerMatchStats[] {
  if (cands.length === 0) return [];
  let pool = cands;
  for (const fn of [primary, ...tiebreaks]) {
    const best = Math.max(...pool.map(fn));
    pool = pool.filter((s) => fn(s) === best);
    if (pool.length === 1) break;
  }
  return pool;
}

export function fmtOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function fmtEcon(runs: number, balls: number): string {
  return balls === 0 ? '–' : ((runs * 6) / balls).toFixed(2);
}

function figures(s: PlayerMatchStats): string {
  return `${fmtOvers(s.bowlBalls)}-${s.maidens}-${s.bowlRuns}-${s.wickets}`;
}

function plural(n: number, w: string, ws = `${w}s`): string {
  return `${n} ${n === 1 ? w : ws}`;
}

/** Average economy across all bowling in the match (runs per over). */
export function matchEconomy(stats: PlayerMatchStats[]): number {
  const balls = stats.reduce((a, s) => a + s.bowlBalls, 0);
  const runs = stats.reduce((a, s) => a + s.bowlRuns, 0);
  return balls === 0 ? 0 : (runs * 6) / balls;
}

export function shahinScore(s: PlayerMatchStats, matchEcon: number, cfg: AwardsConfig): number {
  const w = cfg.shahinWeights;
  const excess = Math.max(0, s.bowlRuns - (matchEcon * s.bowlBalls) / 6);
  return (
    excess +
    w.drop * s.drops +
    w.boundaryMisfield * (s.misfield4 + s.misfield6) +
    w.otherOops * (s.missedRunOuts + s.overthrows)
  );
}

export function computeAwards(state: MatchState, cfg: AwardsConfig = DEFAULT_AWARDS_CONFIG): Award[] {
  const all = Object.values(playerMatchStats(state));
  const awards: Award[] = [];
  const add = (key: TitleKey, winners: PlayerMatchStats[], stat: string, detail?: string) => {
    if (!cfg.titles[key].enabled || winners.length === 0) return;
    awards.push({ key, label: cfg.titles[key].label, playerIds: winners.map((w) => w.id), stat, detail });
  };

  // Fatakeshto: most runs; tie → higher strike rate, then fewer balls.
  {
    const w = pickTop(
      all.filter((s) => s.batRuns > 0),
      (s) => s.batRuns,
      (s) => (s.batBalls ? s.batRuns / s.batBalls : 0),
      (s) => -s.batBalls,
    );
    if (w.length) {
      const s = w[0];
      const bits = [s.fours && plural(s.fours, 'four'), s.sixes && plural(s.sixes, 'six', 'sixes')].filter(Boolean);
      add('fatakeshto', w, `${s.batRuns} off ${s.batBalls}${bits.length ? ' · ' + bits.join(', ') : ''}`);
    }
  }

  // Game Changer: most wickets; tie → fewer runs conceded, then fewer balls.
  {
    const w = pickTop(
      all.filter((s) => s.wickets > 0),
      (s) => s.wickets,
      (s) => -s.bowlRuns,
      (s) => -s.bowlBalls,
    );
    if (w.length) add('gameChanger', w, figures(w[0]));
  }

  // Kipta: lowest economy with a minimum number of balls; tie → more balls bowled.
  {
    let pool = all.filter((s) => s.bowlBalls >= cfg.kiptaMinBalls);
    let minOvers = cfg.kiptaMinBalls;
    if (pool.length === 0) {
      pool = all.filter((s) => s.bowlBalls >= cfg.kiptaFallbackBalls && s.bowlBalls > 0);
      minOvers = cfg.kiptaFallbackBalls;
    }
    const w = pickTop(pool, (s) => -(s.bowlRuns / s.bowlBalls), (s) => s.bowlBalls);
    if (w.length) {
      add('kipta', w, `${figures(w[0])} · economy ${fmtEcon(w[0].bowlRuns, w[0].bowlBalls)}`, `Minimum ${fmtOvers(minOvers)} overs`);
    }
  }

  // Shahin: highest disaster score among bowlers with at least one over. Always awarded.
  {
    const econ = matchEconomy(all);
    const pool = all.filter((s) => s.bowlBalls >= cfg.shahinMinBalls);
    const w = pickTop(pool, (s) => shahinScore(s, econ, cfg), (s) => s.drops, (s) => s.bowlRuns);
    if (w.length) {
      const s = w[0];
      const score = shahinScore(s, econ, cfg);
      const excess = Math.max(0, s.bowlRuns - (econ * s.bowlBalls) / 6);
      const misfields = s.misfield4 + s.misfield6;
      const other = s.missedRunOuts + s.overthrows;
      const fieldBits = [
        s.drops && plural(s.drops, 'drop'),
        misfields && plural(misfields, 'boundary misfield'),
        other && plural(other, 'other oops', 'other oops'),
      ].filter(Boolean);
      const parts = [`${excess.toFixed(1)} runs above match economy (${econ.toFixed(2)})`];
      if (s.drops) parts.push(`${cfg.shahinWeights.drop} × ${plural(s.drops, 'drop')}`);
      if (misfields) parts.push(`${cfg.shahinWeights.boundaryMisfield} × ${plural(misfields, 'boundary misfield')}`);
      if (other) parts.push(`${cfg.shahinWeights.otherOops} × ${plural(other, 'other oops', 'other oops')}`);
      add(
        'shahin',
        w,
        `${figures(s)}${fieldBits.length ? ' and ' + fieldBits.join(', ') : ''}`,
        `Disaster score ${score.toFixed(1)} = ${parts.join(' + ')}`,
      );
    }
  }

  // Miss: most dropped catches; tie → more fielding mistakes overall.
  {
    const w = pickTop(
      all.filter((s) => s.drops > 0),
      (s) => s.drops,
      (s) => s.drops + s.misfield4 + s.misfield6 + s.missedRunOuts + s.overthrows,
    );
    if (w.length) add('miss', w, plural(w[0].drops, 'dropped catch', 'dropped catches'));
  }

  {
    const w = pickTop(all.filter((s) => s.wides > 0), (s) => s.wides);
    if (w.length) add('wideBhai', w, plural(w[0].wides, 'wide'));
  }
  {
    const w = pickTop(all.filter((s) => s.noBalls > 0), (s) => s.noBalls);
    if (w.length) add('noBallNawab', w, plural(w[0].noBalls, 'no-ball'));
  }
  {
    const w = pickTop(
      all.filter((s) => s.misfield4 + s.misfield6 > 0),
      (s) => s.misfield4 + s.misfield6,
      (s) => s.misfield6,
    );
    if (w.length) add('chalni', w, plural(w[0].misfield4 + w[0].misfield6, 'misfield', 'misfields') + ' went to the boundary');
  }
  {
    const w = all.filter((s) => s.duck);
    if (w.length) add('hasherDim', w, 'Out for 0');
  }

  return TITLE_ORDER.flatMap((k) => awards.filter((a) => a.key === k));
}

// ---------- Season ----------

export interface TitleCount {
  key: TitleKey;
  playerId: PlayerId;
  count: number;
}

/** How many times each player won each title across matches. */
export function seasonTitleCounts(matches: Award[][]): TitleCount[] {
  const counts = new Map<string, TitleCount>();
  for (const awards of matches) {
    for (const a of awards) {
      for (const id of a.playerIds) {
        const k = `${a.key}|${id}`;
        const c = counts.get(k) ?? { key: a.key, playerId: id, count: 0 };
        c.count += 1;
        counts.set(k, c);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Career totals: sums each player's per-match stats. */
export function sumStats(matches: Record<PlayerId, PlayerMatchStats>[]): Record<PlayerId, PlayerMatchStats & { matches: number; ducks: number }> {
  const out: Record<PlayerId, PlayerMatchStats & { matches: number; ducks: number }> = {};
  for (const m of matches) {
    for (const s of Object.values(m)) {
      const t = (out[s.id] ??= { ...emptyStats(s.id), matches: 0, ducks: 0 });
      t.matches += 1;
      if (s.duck) t.ducks += 1;
      for (const k of Object.keys(s) as (keyof PlayerMatchStats)[]) {
        const v = s[k];
        if (typeof v === 'number') (t[k] as number) += v;
        else if (typeof v === 'boolean' && v) (t as unknown as Record<string, boolean>)[k] = true;
      }
    }
  }
  return out;
}
