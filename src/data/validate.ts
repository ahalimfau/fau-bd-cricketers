// Everything read from Firestore is treated as untrusted input.
//
// firestore.rules already limits who can write and checks the overall shape,
// but the ball-by-ball list is too detailed to validate fully in rules. So
// every document is rebuilt here, field by field, into a fresh object that
// only contains known fields with checked types and ranges. Unknown fields
// (including tricks like "__proto__") are never copied. Bad items are
// dropped and counted, never shown.

import type {
  BallEvent,
  ExtraType,
  InningsNo,
  MatchEvent,
  MatchMeta,
  Oops,
  OopsType,
  PlayerId,
  TeamKey,
  TeamMeta,
  Wicket,
  WicketHow,
} from '../engine/types';
import { DEFAULT_AWARDS_CONFIG, TITLE_ORDER, type AwardsConfig } from '../engine/awards';
import { isSafePhotoDataUrl } from '../security/photo';

export const MAX_EVENTS = 2000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WICKETS: ReadonlySet<string> = new Set<WicketHow>([
  'bowled', 'caught', 'lbw', 'stumped', 'hitwicket', 'runout', 'obstructing', 'hitballtwice',
]);
const EXTRAS: ReadonlySet<string> = new Set<ExtraType>(['wd', 'nb', 'b', 'lb']);
const OOPS: ReadonlySet<string> = new Set<OopsType>(['drop', 'misfield4', 'misfield6', 'missedRunOut', 'overthrow']);

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function intIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Cleans a display string: removes control characters and the invisible
 * bidirectional-override characters that can make text display differently
 * from what it contains, collapses whitespace, and enforces a length.
 */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 1 || s.length > max) return null;
  return s;
}

// ---------- Players ----------

export interface Player {
  id: PlayerId;
  name: string;
  photo?: string;
  active: boolean;
}

export function sanitizePlayer(id: unknown, raw: unknown): Player | null {
  if (!isId(id) || !isObj(raw)) return null;
  const name = cleanText(raw.name, 40);
  if (!name) return null;
  const p: Player = { id, name, active: raw.active !== false };
  if (isSafePhotoDataUrl(raw.photo)) p.photo = raw.photo;
  return p;
}

// ---------- Match meta ----------

function sanitizeTeam(raw: unknown): TeamMeta | null {
  if (!isObj(raw) || !Array.isArray(raw.playerIds)) return null;
  const name = cleanText(raw.name, 30);
  if (!name) return null;
  const ids = raw.playerIds.filter(isId);
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 30 || unique.length !== raw.playerIds.length) return null;
  return { name, playerIds: unique };
}

export function sanitizeMeta(raw: unknown): MatchMeta | null {
  if (!isObj(raw)) return null;
  if (!intIn(raw.oversPerInnings, 1, 50)) return null;
  if (raw.battingFirst !== 'A' && raw.battingFirst !== 'B') return null;
  const teamA = sanitizeTeam(raw.teamA);
  const teamB = sanitizeTeam(raw.teamB);
  if (!teamA || !teamB) return null;
  // A player can't be on both sides.
  if (teamA.playerIds.some((id) => teamB.playerIds.includes(id))) return null;
  return { oversPerInnings: raw.oversPerInnings, battingFirst: raw.battingFirst, teamA, teamB };
}

// ---------- Events ----------

function sides(meta: MatchMeta, inn: InningsNo): { bat: Set<string>; field: Set<string> } {
  const battingKey: TeamKey = inn === 1 ? meta.battingFirst : meta.battingFirst === 'A' ? 'B' : 'A';
  const bat = battingKey === 'A' ? meta.teamA : meta.teamB;
  const field = battingKey === 'A' ? meta.teamB : meta.teamA;
  return { bat: new Set(bat.playerIds), field: new Set(field.playerIds) };
}

function sanitizeOops(raw: unknown, field: Set<string>): Oops | null {
  if (!isObj(raw) || typeof raw.type !== 'string' || !OOPS.has(raw.type)) return null;
  if (!isId(raw.fielderId) || !field.has(raw.fielderId)) return null;
  return { type: raw.type as OopsType, fielderId: raw.fielderId };
}

function sanitizeWicket(raw: unknown, bat: Set<string>, field: Set<string>): Wicket | null {
  if (!isObj(raw) || typeof raw.how !== 'string' || !WICKETS.has(raw.how)) return null;
  if (!isId(raw.outId) || !bat.has(raw.outId)) return null;
  const w: Wicket = { how: raw.how as WicketHow, outId: raw.outId };
  if (raw.fielderId !== undefined) {
    if (!isId(raw.fielderId) || !field.has(raw.fielderId)) return null;
    w.fielderId = raw.fielderId;
  }
  for (const k of ['newBatterId', 'nextStrikerId'] as const) {
    const v = raw[k];
    if (v === undefined) continue;
    if (!isId(v) || !bat.has(v)) return null;
    w[k] = v;
  }
  return w;
}

function sanitizeBall(raw: Obj, inn: InningsNo, bat: Set<string>, field: Set<string>): BallEvent | null {
  if (!intIn(raw.runsBat, 0, 12)) return null;
  const e: BallEvent = { kind: 'ball', inn, runsBat: raw.runsBat };
  if (raw.boundary !== undefined) {
    if (typeof raw.boundary !== 'boolean') return null;
    if (raw.boundary) e.boundary = true;
  }
  if (raw.extra !== undefined) {
    const x = raw.extra;
    if (!isObj(x) || typeof x.type !== 'string' || !EXTRAS.has(x.type) || !intIn(x.runs, 0, 12)) return null;
    e.extra = { type: x.type as ExtraType, runs: x.runs };
    if (x.nbRunsAs !== undefined) {
      if (x.nbRunsAs !== 'b' && x.nbRunsAs !== 'lb') return null;
      e.extra.nbRunsAs = x.nbRunsAs;
    }
  }
  if (raw.wicket !== undefined) {
    const w = sanitizeWicket(raw.wicket, bat, field);
    if (!w) return null;
    e.wicket = w;
  }
  if (raw.oops !== undefined) {
    if (!Array.isArray(raw.oops) || raw.oops.length > 5) return null;
    const list: Oops[] = [];
    for (const o of raw.oops) {
      const ok = sanitizeOops(o, field);
      if (!ok) return null;
      list.push(ok);
    }
    if (list.length) e.oops = list;
  }
  if (typeof raw.ts === 'number' && Number.isFinite(raw.ts)) e.ts = raw.ts;
  return e;
}

export function sanitizeEvent(raw: unknown, meta: MatchMeta): MatchEvent | null {
  if (!isObj(raw)) return null;
  const inn = raw.inn;
  if (inn !== 1 && inn !== 2) return null;
  const { bat, field } = sides(meta, inn);
  const inBat = (v: unknown): v is string => isId(v) && bat.has(v);
  const inField = (v: unknown): v is string => isId(v) && field.has(v);
  switch (raw.kind) {
    case 'ball':
      return sanitizeBall(raw, inn, bat, field);
    case 'setOpeners':
      return inBat(raw.strikerId) && inBat(raw.nonStrikerId)
        ? { kind: 'setOpeners', inn, strikerId: raw.strikerId, nonStrikerId: raw.nonStrikerId }
        : null;
    case 'setBowler':
      if (!inField(raw.bowlerId)) return null;
      return raw.midOver === true
        ? { kind: 'setBowler', inn, bowlerId: raw.bowlerId, midOver: true }
        : { kind: 'setBowler', inn, bowlerId: raw.bowlerId };
    case 'swapStrike':
      return { kind: 'swapStrike', inn };
    case 'endInnings':
      return { kind: 'endInnings', inn };
    case 'retire':
      return inBat(raw.playerId) && inBat(raw.replacementId)
        ? { kind: 'retire', inn, playerId: raw.playerId, replacementId: raw.replacementId }
        : null;
    case 'oops': {
      const o = sanitizeOops(raw.oops, field);
      return o ? { kind: 'oops', inn, oops: o } : null;
    }
    default:
      return null;
  }
}

export interface CleanEvents {
  events: MatchEvent[];
  /** sourceIndex[i] = position of events[i] in the stored list (used by edit/delete). */
  sourceIndex: number[];
  dropped: number;
}

export function sanitizeEvents(raw: unknown, meta: MatchMeta): CleanEvents {
  const out: CleanEvents = { events: [], sourceIndex: [], dropped: 0 };
  if (!Array.isArray(raw)) return out;
  const list = raw.slice(0, MAX_EVENTS);
  out.dropped = raw.length - list.length;
  list.forEach((item, i) => {
    const e = sanitizeEvent(item, meta);
    if (e) {
      out.events.push(e);
      out.sourceIndex.push(i);
    } else {
      out.dropped += 1;
    }
  });
  return out;
}

// ---------- Settings ----------

export function sanitizeConfig(raw: unknown): AwardsConfig {
  const cfg: AwardsConfig = structuredClone(DEFAULT_AWARDS_CONFIG);
  if (!isObj(raw)) return cfg;
  if (isObj(raw.titles)) {
    for (const key of TITLE_ORDER) {
      const t = raw.titles[key];
      if (!isObj(t)) continue;
      const label = cleanText(t.label, 30);
      if (label) cfg.titles[key].label = label;
      if (typeof t.enabled === 'boolean') cfg.titles[key].enabled = t.enabled;
    }
  }
  if (isObj(raw.shahinWeights)) {
    for (const k of ['drop', 'boundaryMisfield', 'otherOops'] as const) {
      const v = raw.shahinWeights[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 50) cfg.shahinWeights[k] = v;
    }
  }
  for (const k of ['kiptaMinBalls', 'kiptaFallbackBalls', 'shahinMinBalls'] as const) {
    if (intIn(raw[k], 0, 300)) cfg[k] = raw[k];
  }
  return cfg;
}
