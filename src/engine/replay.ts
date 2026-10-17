import type {
  BallEvent,
  BallView,
  BatterStats,
  BowlerStats,
  ExtraType,
  FieldingStats,
  InningsNo,
  InningsState,
  MatchEvent,
  MatchMeta,
  MatchResult,
  MatchState,
  Needs,
  OverSummary,
  PlayerId,
  TeamKey,
  WicketHow,
} from './types';

/** Dismissals credited to the bowler. Run out, obstructing and hit-the-ball-twice are not. */
export const BOWLER_WICKETS: ReadonlySet<WicketHow> = new Set<WicketHow>([
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hitwicket',
]);

const ALL_DISMISSALS: WicketHow[] = [
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hitwicket',
  'runout',
  'obstructing',
  'hitballtwice',
];

/**
 * Which dismissals the Laws allow on each kind of delivery.
 * Wide (Law 22): only hit wicket, obstructing the field, run out, stumped.
 * No-ball (Law 21): only run out, hit the ball twice, obstructing the field.
 */
export function allowedDismissals(extra?: ExtraType): WicketHow[] {
  if (extra === 'wd') return ['stumped', 'runout', 'hitwicket', 'obstructing'];
  if (extra === 'nb') return ['runout', 'obstructing', 'hitballtwice'];
  // Byes/leg byes are legal deliveries; a bye can't be caught or LBW in practice
  // but the Laws don't forbid recording them, so allow everything.
  return ALL_DISMISSALS;
}

export function otherTeam(t: TeamKey): TeamKey {
  return t === 'A' ? 'B' : 'A';
}

export function teamOf(meta: MatchMeta, t: TeamKey) {
  return t === 'A' ? meta.teamA : meta.teamB;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

interface Work {
  curOver: OverSummary | null;
  swappedAtEnd: boolean;
  prevOverBowler?: PlayerId;
}

function newInnings(meta: MatchMeta, no: InningsNo): InningsState {
  const batting = no === 1 ? meta.battingFirst : otherTeam(meta.battingFirst);
  const size = teamOf(meta, batting).playerIds.length;
  return {
    number: no,
    battingTeam: batting,
    bowlingTeam: otherTeam(batting),
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    overs: '0.0',
    completedOvers: 0,
    extras: { wd: 0, nb: 0, b: 0, lb: 0, total: 0 },
    batters: [],
    bowlers: [],
    overList: [],
    fow: [],
    maxWickets: Math.max(1, size - 1),
    complete: false,
    started: false,
  };
}

function oversText(inn: InningsState, w: Work): string {
  const partial = w.curOver && w.curOver.legalBalls < 6 ? w.curOver.legalBalls : 0;
  return `${inn.completedOvers}.${partial}`;
}

function batter(inn: InningsState, id: PlayerId): BatterStats {
  let b = inn.batters.find((x) => x.id === id);
  if (!b) {
    b = { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, retired: false };
    inn.batters.push(b);
  }
  return b;
}

function bowler(inn: InningsState, id: PlayerId): BowlerStats {
  let b = inn.bowlers.find((x) => x.id === id);
  if (!b) {
    b = { id, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0, dots: 0 };
    inn.bowlers.push(b);
  }
  return b;
}

function fielder(map: Record<PlayerId, FieldingStats>, id: PlayerId): FieldingStats {
  if (!map[id]) {
    map[id] = {
      id,
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
  return map[id];
}

function swap(inn: InningsState) {
  const s = inn.strikerId;
  inn.strikerId = inn.nonStrikerId;
  inn.nonStrikerId = s;
}

function closeOver(inn: InningsState, w: Work, warnings: string[]) {
  const over = w.curOver;
  if (!over) return;
  if (over.balls.length > 0) {
    if (!w.swappedAtEnd) {
      // A short over (only possible after an edit) still counts as an over,
      // and the batters still change ends.
      warnings.push(
        `Innings ${inn.number}, over ${over.number} has only ${over.legalBalls} legal balls.`,
      );
      inn.completedOvers += 1;
      swap(inn);
    }
    w.prevOverBowler = over.bowlerId;
  }
  w.curOver = null;
  w.swappedAtEnd = false;
}

function ballLabel(e: BallEvent, teamRuns: number): string {
  const t = e.extra?.type;
  const exRuns = e.extra?.runs ?? 0;
  if (e.wicket) {
    const prefix = t === 'wd' ? 'Wd' : t === 'nb' ? 'Nb' : teamRuns > 0 ? String(teamRuns) : '';
    return `${prefix}W`;
  }
  if (t === 'wd') return teamRuns === 1 ? 'Wd' : `${teamRuns}Wd`;
  if (t === 'nb') return teamRuns === 1 ? 'Nb' : `Nb+${teamRuns - 1}`;
  if (t === 'b') return `${exRuns}b`;
  if (t === 'lb') return `${exRuns}lb`;
  return String(e.runsBat);
}

function checkComplete(inn: InningsState, meta: MatchMeta) {
  if (inn.complete) return;
  if (inn.number === 2 && inn.target !== undefined && inn.runs >= inn.target) {
    inn.complete = true;
    inn.endReason = 'target';
  } else if (inn.wickets >= inn.maxWickets) {
    inn.complete = true;
    inn.endReason = 'allOut';
  } else if (inn.completedOvers >= meta.oversPerInnings) {
    inn.complete = true;
    inn.endReason = 'overs';
  }

}

function applyBall(
  e: BallEvent,
  idx: number,
  inn: InningsState,
  w: Work,
  meta: MatchMeta,
  fielding: Record<PlayerId, FieldingStats>,
  warnings: string[],
) {
  const where = `Innings ${inn.number}, event ${idx + 1}`;
  if (!inn.strikerId || !inn.nonStrikerId) {
    warnings.push(`${where}: a ball was recorded without two batters in. It was ignored.`);
    return;
  }
  if (!inn.bowlerId) {
    warnings.push(`${where}: a ball was recorded before a bowler was picked. It was ignored.`);
    return;
  }
  if (!w.curOver) {
    // Should not happen in normal flow: setBowler opens every over.
    w.curOver = newOver(inn, inn.bowlerId);
  } else if (w.curOver.legalBalls >= 6) {
    warnings.push(
      `Innings ${inn.number}, over ${w.curOver.number} has more than 6 legal balls. Pick the next bowler or fix the over.`,
    );
  }
  const over = w.curOver;
  const bowlerId = inn.bowlerId;
  const strikerId = inn.strikerId;
  const nonStrikerId = inn.nonStrikerId;

  const ex = e.extra;
  const t = ex?.type;
  const isWd = t === 'wd';
  const isNb = t === 'nb';
  const legal = !isWd && !isNb;
  const exRuns = Math.max(0, ex?.runs ?? 0);
  const batRunsAllowed = !(isWd || t === 'b' || t === 'lb');
  if (!batRunsAllowed && e.runsBat) {
    warnings.push(`${where}: bat runs can't be scored off a ${t}; they were ignored.`);
  }
  const runsBat = batRunsAllowed ? Math.max(0, e.runsBat) : 0;
  const penalty = isWd || isNb ? 1 : 0;
  const teamRuns = runsBat + penalty + exRuns;
  const bowlerRuns = runsBat + (isWd ? 1 + exRuns : 0) + (isNb ? 1 : 0);

  // Team and extras
  inn.runs += teamRuns;
  if (isWd) inn.extras.wd += 1 + exRuns;
  if (isNb) {
    inn.extras.nb += 1;
    if (exRuns) {
      if (ex?.nbRunsAs === 'lb') inn.extras.lb += exRuns;
      else inn.extras.b += exRuns;
    }
  }
  if (t === 'b') inn.extras.b += exRuns;
  if (t === 'lb') inn.extras.lb += exRuns;
  inn.extras.total = inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb;

  // Batter: a no-ball counts as a ball faced, a wide does not.
  const sb = batter(inn, strikerId);
  sb.runs += runsBat;
  if (!isWd) sb.balls += 1;
  if (e.boundary && runsBat === 4) sb.fours += 1;
  if (e.boundary && runsBat === 6) sb.sixes += 1;

  // Bowler
  const bw = bowler(inn, bowlerId);
  bw.runs += bowlerRuns;
  if (legal) {
    bw.balls += 1;
    inn.legalBalls += 1;
    if (bowlerRuns === 0) bw.dots += 1;
  }
  if (isWd) bw.wides += 1;
  if (isNb) bw.noBalls += 1;

  over.bowlerRuns += bowlerRuns;
  over.teamRuns += teamRuns;
  if (legal) over.legalBalls += 1;
  if (isWd) over.wides += 1;
  if (isNb) over.noBalls += 1;

  // Batters cross once per run actually run; the penalty run is not run.
  const ran = runsBat + exRuns;
  if (ran % 2 === 1) swap(inn);

  // Wicket
  let isWicket = false;
  if (e.wicket) {
    const wk = e.wicket;
    const allowed = allowedDismissals(t);
    const atCrease = wk.outId === inn.strikerId || wk.outId === inn.nonStrikerId;
    if (!allowed.includes(wk.how)) {
      warnings.push(`${where}: "${wk.how}" isn't possible off a ${t === 'wd' ? 'wide' : 'no-ball'}. Wicket ignored.`);
    } else if (!atCrease) {
      warnings.push(`${where}: the dismissed player isn't one of the two batters. Wicket ignored.`);
    } else {
      isWicket = true;
      inn.wickets += 1;
      const credited = BOWLER_WICKETS.has(wk.how);
      if (credited) bw.wickets += 1;
      over.wickets += 1;
      const ob = batter(inn, wk.outId);
      ob.out = true;
      ob.dismissal = { how: wk.how, bowlerId: credited ? bowlerId : undefined, fielderId: wk.fielderId };
      if (wk.fielderId) {
        const f = fielder(fielding, wk.fielderId);
        if (wk.how === 'caught') f.catches += 1;
        if (wk.how === 'runout') f.runOuts += 1;
        if (wk.how === 'stumped') f.stumpings += 1;
      }
      const outWasStriker = inn.strikerId === wk.outId;
      const partner = outWasStriker ? inn.nonStrikerId : inn.strikerId;
      const willBeAllOut = inn.wickets >= inn.maxWickets;
      let incoming: PlayerId | undefined;
      if (!willBeAllOut && wk.newBatterId) {
        const prior = inn.batters.find((x) => x.id === wk.newBatterId);
        if (prior && (prior.out || prior.balls > 0 || prior.id === partner)) {
          warnings.push(`${where}: the new batter has already batted.`);
        }
        incoming = wk.newBatterId;
        batter(inn, incoming);
      }
      if (outWasStriker) inn.strikerId = incoming;
      else inn.nonStrikerId = incoming;
      // Law 18.11 (2022): after a catch the new batter takes strike.
      if (wk.how === 'caught' && incoming) {
        inn.strikerId = incoming;
        inn.nonStrikerId = partner;
      }
      if (wk.nextStrikerId && incoming) {
        if (wk.nextStrikerId === incoming || wk.nextStrikerId === partner) {
          inn.strikerId = wk.nextStrikerId;
          inn.nonStrikerId = wk.nextStrikerId === incoming ? partner : incoming;
        }
      }
      inn.fow.push({
        wicketNo: inn.wickets,
        runs: inn.runs,
        overs: '', // filled in once the ball is added to the over
        playerId: wk.outId,
      });
    }
  }

  for (const o of e.oops ?? []) {
    const f = fielder(fielding, o.fielderId);
    if (o.type === 'drop') f.drops += 1;
    else if (o.type === 'misfield4') f.misfield4 += 1;
    else if (o.type === 'misfield6') f.misfield6 += 1;
    else if (o.type === 'missedRunOut') f.missedRunOuts += 1;
    else if (o.type === 'overthrow') f.overthrows += 1;
  }

  const view: BallView = {
    eventIndex: idx,
    overNumber: over.number,
    ballInOver: over.legalBalls,
    legal,
    label: ballLabel(e, teamRuns),
    bowlerId,
    strikerId,
    nonStrikerId,
    teamRuns,
    bowlerRuns,
    isWicket,
    isBoundary: !!e.boundary && (runsBat === 4 || runsBat === 6),
    extraType: t,
  };
  over.balls.push(view);
  if (isWicket) inn.fow[inn.fow.length - 1].overs = `${inn.completedOvers}.${over.legalBalls}`;

  // End of over: batters change ends.
  if (legal && over.legalBalls === 6) {
    inn.completedOvers += 1;
    swap(inn);
    w.swappedAtEnd = true;
  }
  checkComplete(inn, meta);
}

function newOver(inn: InningsState, bowlerId: PlayerId): OverSummary {
  const over: OverSummary = {
    number: inn.overList.length + 1,
    bowlerId,
    legalBalls: 0,
    balls: [],
    bowlerRuns: 0,
    teamRuns: 0,
    wides: 0,
    noBalls: 0,
    wickets: 0,
  };
  inn.overList.push(over);
  bowler(inn, bowlerId);
  return over;
}

export function replay(meta: MatchMeta, events: MatchEvent[]): MatchState {
  const warnings: string[] = [];
  const fielding: Record<PlayerId, FieldingStats> = {};
  const inns: [InningsState, InningsState] = [newInnings(meta, 1), newInnings(meta, 2)];
  const works: [Work, Work] = [
    { curOver: null, swappedAtEnd: false },
    { curOver: null, swappedAtEnd: false },
  ];

  events.forEach((e, idx) => {
    const inn = inns[e.inn - 1];
    const w = works[e.inn - 1];
    if (e.inn === 2) {
      if (inn.target === undefined) inn.target = inns[0].runs + 1;
      if (!inns[0].complete && !inn.started) {
        warnings.push('Second innings started before the first innings was finished.');
      }
    }
    if (inn.complete && e.kind !== 'oops') {
      warnings.push(`Innings ${e.inn}, event ${idx + 1} comes after the innings ended and was ignored.`);
      return;
    }
    switch (e.kind) {
      case 'setOpeners': {
        if (inn.legalBalls > 0 || inn.overList.some((o) => o.balls.length > 0)) {
          warnings.push(`Innings ${e.inn}: openers were changed after play started. Ignored.`);
          return;
        }
        if (e.strikerId === e.nonStrikerId) {
          warnings.push(`Innings ${e.inn}: both openers are the same player. Ignored.`);
          return;
        }
        // Replace any earlier opener choice.
        inn.batters = [];
        inn.strikerId = e.strikerId;
        inn.nonStrikerId = e.nonStrikerId;
        batter(inn, e.strikerId);
        batter(inn, e.nonStrikerId);
        inn.started = true;
        return;
      }
      case 'setBowler': {
        if (e.midOver && w.curOver && w.curOver.balls.length > 0 && w.curOver.legalBalls < 6) {
          inn.bowlerId = e.bowlerId;
          bowler(inn, e.bowlerId);
          return;
        }
        if (w.curOver && w.curOver.balls.length === 0) {
          // Bowler re-picked before the over started.
          inn.overList.pop();
          w.curOver = null;
        } else {
          closeOver(inn, w, warnings);
        }
        if (w.prevOverBowler === e.bowlerId) {
          warnings.push(`Innings ${e.inn}: the same bowler bowled two overs in a row (over ${inn.overList.length + 1}).`);
        }
        inn.bowlerId = e.bowlerId;
        w.curOver = newOver(inn, e.bowlerId);
        inn.overs = oversText(inn, w);
        return;
      }
      case 'swapStrike':
        swap(inn);
        return;
      case 'retire': {
        if (e.playerId !== inn.strikerId && e.playerId !== inn.nonStrikerId) {
          warnings.push(`Innings ${e.inn}: retired player isn't batting. Ignored.`);
          return;
        }
        batter(inn, e.playerId).retired = true;
        batter(inn, e.replacementId);
        if (inn.strikerId === e.playerId) inn.strikerId = e.replacementId;
        else inn.nonStrikerId = e.replacementId;
        return;
      }
      case 'endInnings':
        inn.complete = true;
        inn.endReason = 'declared';
        return;
      case 'oops': {
        const f = fielder(fielding, e.oops.fielderId);
        const k = e.oops.type;
        if (k === 'drop') f.drops += 1;
        else if (k === 'misfield4') f.misfield4 += 1;
        else if (k === 'misfield6') f.misfield6 += 1;
        else if (k === 'missedRunOut') f.missedRunOuts += 1;
        else f.overthrows += 1;
        return;
      }
      case 'ball':
        applyBall(e, idx, inn, w, meta, fielding, warnings);
        inn.overs = oversText(inn, w);
        return;
    }
  });

  for (let i = 0; i < 2; i++) {
    inns[i].overs = oversText(inns[i], works[i]);
    // A maiden is a full over with nothing charged to the bowler
    // (byes and leg byes don't spoil it).
    for (const o of inns[i].overList) {
      if (o.legalBalls >= 6 && o.bowlerRuns === 0) bowler(inns[i], o.bowlerId).maidens += 1;
    }
  }
  if (inns[1].target === undefined) inns[1].target = inns[0].complete ? inns[0].runs + 1 : undefined;

  const current: InningsNo = inns[0].complete || inns[1].started ? 2 : 1;
  const complete = inns[1].complete;
  let needs: Needs = null;
  if (!complete) {
    const cur = inns[current - 1];
    const w = works[current - 1];
    if (!cur.started) needs = 'openers';
    else if (!cur.strikerId || !cur.nonStrikerId) needs = 'newBatter';
    else if (!cur.bowlerId || !w.curOver || w.curOver.legalBalls >= 6) needs = 'bowler';
  }

  let result: MatchResult | undefined;
  if (complete) {
    const [i1, i2] = inns;
    const t1 = teamOf(meta, i1.battingTeam).name;
    const t2 = teamOf(meta, i2.battingTeam).name;
    if (i2.target !== undefined && i2.runs >= i2.target) {
      result = { winner: i2.battingTeam, text: `${t2} won by ${plural(i2.maxWickets - i2.wickets, 'wicket')}` };
    } else if (i2.runs === i1.runs) {
      result = { winner: null, text: 'Match tied' };
    } else {
      result = { winner: i1.battingTeam, text: `${t1} won by ${plural(i1.runs - i2.runs, 'run')}` };
    }
  }

  return { innings: inns, current, needs, complete, result, fielding, warnings };
}

/** The over currently being bowled in the live innings, if any. */
export function currentOver(state: MatchState): OverSummary | undefined {
  const inn = state.innings[state.current - 1];
  const last = inn.overList[inn.overList.length - 1];
  return last;
}

/** Economy rate (runs per 6 legal balls). */
export function economy(runs: number, balls: number): number {
  return balls === 0 ? 0 : (runs * 6) / balls;
}

export function bowlerOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}
