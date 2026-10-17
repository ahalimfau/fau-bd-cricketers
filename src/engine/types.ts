// Core data types for the scoring engine.
// The match is stored as an append-only list of events; every number shown in
// the app is recomputed from that list by `replay`, which is what makes
// unlimited undo and editing of any earlier ball safe.

export type PlayerId = string;
export type TeamKey = 'A' | 'B';
export type InningsNo = 1 | 2;

export type ExtraType = 'wd' | 'nb' | 'b' | 'lb';

export type WicketHow =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'stumped'
  | 'hitwicket'
  | 'runout'
  | 'obstructing'
  | 'hitballtwice';

export type OopsType = 'drop' | 'misfield4' | 'misfield6' | 'missedRunOut' | 'overthrow';

export interface Wicket {
  how: WicketHow;
  outId: PlayerId;
  fielderId?: PlayerId;
  /** Replacement batter. Omitted only when this wicket ends the innings. */
  newBatterId?: PlayerId;
  /** Optional override of who faces the next ball (used for run outs). */
  nextStrikerId?: PlayerId;
}

export interface Oops {
  type: OopsType;
  fielderId: PlayerId;
}

export interface BallEvent {
  kind: 'ball';
  inn: InningsNo;
  /** Runs credited to the batter off the bat. Always 0 for wides, byes and leg byes. */
  runsBat: number;
  /** True when the bat runs were a boundary (counts a four or a six). */
  boundary?: boolean;
  /**
   * Extra on this delivery. `runs` is what was run or reached the boundary
   * beyond the automatic 1-run wide/no-ball penalty:
   *  - wd: extra wides run (all scored as wides)
   *  - nb: byes or leg byes run off the no-ball (`nbRunsAs`); bat runs go in runsBat
   *  - b / lb: the byes or leg byes
   */
  extra?: { type: ExtraType; runs: number; nbRunsAs?: 'b' | 'lb' };
  wicket?: Wicket;
  oops?: Oops[];
  ts?: number;
}

export interface SetOpenersEvent {
  kind: 'setOpeners';
  inn: InningsNo;
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
}

/**
 * Starts a new over with this bowler. Over boundaries are defined by these
 * events (not by counting balls), so an edit that turns a legal ball into a
 * wide can't shift every later over. `midOver` swaps the bowler without
 * starting a new over (e.g. injury).
 */
export interface SetBowlerEvent {
  kind: 'setBowler';
  inn: InningsNo;
  bowlerId: PlayerId;
  midOver?: boolean;
}

export interface SwapStrikeEvent {
  kind: 'swapStrike';
  inn: InningsNo;
}

/** Batter retires not out and is replaced. Not a wicket. */
export interface RetireEvent {
  kind: 'retire';
  inn: InningsNo;
  playerId: PlayerId;
  replacementId: PlayerId;
}

/** Manually close the innings (bad light, agreement, etc.). */
export interface EndInningsEvent {
  kind: 'endInnings';
  inn: InningsNo;
}

/** A fielding mistake logged against a ball after the fact is stored on the ball itself; this is for one not tied to a ball. */
export interface OopsEvent {
  kind: 'oops';
  inn: InningsNo;
  oops: Oops;
}

export type MatchEvent =
  | BallEvent
  | SetOpenersEvent
  | SetBowlerEvent
  | SwapStrikeEvent
  | RetireEvent
  | EndInningsEvent
  | OopsEvent;

export interface TeamMeta {
  name: string;
  playerIds: PlayerId[];
}

export interface MatchMeta {
  oversPerInnings: number;
  teamA: TeamMeta;
  teamB: TeamMeta;
  battingFirst: TeamKey;
}

// ---------- Derived state ----------

export interface BatterStats {
  id: PlayerId;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  retired: boolean;
  dismissal?: { how: WicketHow; bowlerId?: PlayerId; fielderId?: PlayerId };
}

export interface BowlerStats {
  id: PlayerId;
  /** Legal balls bowled. */
  balls: number;
  /** Runs charged to the bowler (bat runs + all wide runs + no-ball penalties). */
  runs: number;
  wickets: number;
  /** Number of wide deliveries. */
  wides: number;
  /** Number of no-ball deliveries. */
  noBalls: number;
  maidens: number;
  dots: number;
}

export interface FieldingStats {
  id: PlayerId;
  catches: number;
  runOuts: number;
  stumpings: number;
  drops: number;
  misfield4: number;
  misfield6: number;
  missedRunOuts: number;
  overthrows: number;
}

export interface BallView {
  eventIndex: number;
  overNumber: number; // 1-based
  /** Legal-ball count within the over after this delivery (a wide keeps the previous count). */
  ballInOver: number;
  legal: boolean;
  label: string;
  bowlerId: PlayerId;
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  teamRuns: number; // runs added to the team by this ball
  bowlerRuns: number; // runs charged to the bowler by this ball
  isWicket: boolean;
  isBoundary: boolean;
  extraType?: ExtraType;
}

export interface OverSummary {
  number: number; // 1-based
  bowlerId: PlayerId;
  legalBalls: number;
  balls: BallView[];
  bowlerRuns: number;
  teamRuns: number;
  wides: number;
  noBalls: number;
  wickets: number;
}

export interface FallOfWicket {
  wicketNo: number;
  runs: number;
  overs: string;
  playerId: PlayerId;
}

export type InningsEndReason = 'overs' | 'allOut' | 'target' | 'declared';

export interface InningsState {
  number: InningsNo;
  battingTeam: TeamKey;
  bowlingTeam: TeamKey;
  runs: number;
  wickets: number;
  legalBalls: number;
  /** Overs display, e.g. "9.2". */
  overs: string;
  completedOvers: number;
  extras: { wd: number; nb: number; b: number; lb: number; total: number };
  batters: BatterStats[];
  bowlers: BowlerStats[];
  overList: OverSummary[];
  fow: FallOfWicket[];
  strikerId?: PlayerId;
  nonStrikerId?: PlayerId;
  bowlerId?: PlayerId;
  target?: number;
  maxWickets: number;
  complete: boolean;
  endReason?: InningsEndReason;
  started: boolean;
}

export type Needs = 'openers' | 'bowler' | 'newBatter' | null;

export interface MatchResult {
  winner: TeamKey | null; // null = tie
  text: string;
}

export interface MatchState {
  innings: InningsState[];
  current: InningsNo;
  needs: Needs;
  complete: boolean;
  result?: MatchResult;
  fielding: Record<PlayerId, FieldingStats>;
  /** Problems created by edits (e.g. a 7-ball over). Shown to the scorer. */
  warnings: string[];
}
