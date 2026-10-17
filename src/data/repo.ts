// Every write the app makes to Firestore lives here. The document shapes come
// from payloads.ts, which the security-rules test checks against
// firestore.rules.
//
// Writes are never awaited before the screen updates: Firestore applies them
// to the local cache at once and syncs when there's signal, so scoring keeps
// working with no network. The returned promise settles when the server
// accepts or refuses the write.

import { collection, deleteDoc, doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { db } from '../firebase';
import type { MatchEvent, MatchMeta } from '../engine/types';
import type { AwardsConfig } from '../engine/awards';
import type { MatchStatus } from './validate';
import { configDoc, matchUpdate, newMatchDoc, playerDoc } from './payloads';

function store(): Firestore {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

export function newId(col: 'players' | 'matches'): string {
  return doc(collection(store(), col)).id;
}

// ---------- Players (admin only) ----------

export function savePlayer(id: string, p: { name: string; active: boolean; photo?: string | null }) {
  return setDoc(doc(store(), 'players', id), playerDoc(p));
}

export function deletePlayer(id: string) {
  return deleteDoc(doc(store(), 'players', id));
}

// ---------- Settings (admin only) ----------

export function saveConfig(cfg: AwardsConfig, defaultOvers: number) {
  return setDoc(doc(store(), 'config', 'app'), configDoc(cfg, defaultOvers));
}

// ---------- Matches (scorer or admin) ----------

/** Creates a match and returns its id straight away (the write syncs in the background). */
export function createMatch(meta: MatchMeta, events: MatchEvent[], uid: string): { id: string; saved: Promise<void> } {
  const id = newId('matches');
  const saved = setDoc(doc(store(), 'matches', id), newMatchDoc(meta, events, uid));
  return { id, saved };
}

export function writeMatch(id: string, events: unknown[], version: number, status?: MatchStatus) {
  return updateDoc(doc(store(), 'matches', id), matchUpdate(events, version, status));
}

export function deleteMatch(id: string) {
  return deleteDoc(doc(store(), 'matches', id));
}

/** Plain-language message for a failed write. */
export function writeErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'permission-denied') {
    return "Not saved: the server refused it. The match may be finished and locked, another phone may have scored at the same time, or you're not signed in.";
  }
  if (code === 'unavailable') return 'No connection. It will sync when the signal is back.';
  return `Not saved (${code ?? 'unknown error'}).`;
}
