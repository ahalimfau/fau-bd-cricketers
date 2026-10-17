// The exact documents the app writes to Firestore. Kept separate from repo.ts
// so the security-rules test (rules.emulator.test.ts) sends byte-for-byte the
// same shapes as the app does.

import { serverTimestamp } from 'firebase/firestore';
import type { MatchEvent, MatchMeta } from '../engine/types';
import type { AwardsConfig } from '../engine/awards';
import type { MatchStatus } from './validate';

export function playerDoc(p: { name: string; active: boolean; photo?: string | null }) {
  return { name: p.name, active: p.active, photo: p.photo ?? null, updatedAt: serverTimestamp() };
}

export function configDoc(cfg: AwardsConfig, defaultOvers: number) {
  return {
    titles: cfg.titles,
    shahinWeights: cfg.shahinWeights,
    kiptaMinBalls: cfg.kiptaMinBalls,
    kiptaFallbackBalls: cfg.kiptaFallbackBalls,
    shahinMinBalls: cfg.shahinMinBalls,
    defaultOvers,
    updatedAt: serverTimestamp(),
  };
}

function plainMeta(m: MatchMeta) {
  return {
    oversPerInnings: m.oversPerInnings,
    battingFirst: m.battingFirst,
    teamA: { name: m.teamA.name, playerIds: [...m.teamA.playerIds] },
    teamB: { name: m.teamB.name, playerIds: [...m.teamB.playerIds] },
    ...(m.toss ? { toss: { winner: m.toss.winner, choice: m.toss.choice } } : {}),
  };
}

export function newMatchDoc(meta: MatchMeta, events: MatchEvent[], uid: string) {
  return {
    meta: plainMeta(meta),
    status: 'live' as const,
    events,
    version: 1,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function matchUpdate(events: unknown[], version: number, status?: MatchStatus) {
  return { events, version, updatedAt: serverTimestamp(), ...(status ? { status } : {}) };
}
