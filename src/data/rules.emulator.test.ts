// Security-rules test against the real firestore.rules, run on the local
// Firebase emulator. Skipped in a normal `npm test` (and in the deploy
// workflow) because it needs the emulator running:
//
//   firebase emulators:start --only firestore,auth --project demo-fau-bd
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run src/data/rules.emulator.test.ts
//
// Every write uses the same payload builders as the app (payloads.ts).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { ADMIN_UID, SCORER_UID } from '../config/roles';
import { DEFAULT_AWARDS_CONFIG } from '../engine/awards';
import { replay } from '../engine/replay';
import type { MatchEvent, MatchMeta } from '../engine/types';
import { configDoc, matchUpdate, newMatchDoc, playerDoc } from './payloads';
import { sanitizeMatch } from './validate';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ON = !!env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-fau-bd';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const STRANGER_UID = 'someStrangerUid000000000001';

async function createUser(localId: string, email: string) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, email, password: 'test-password-123' }),
  });
  if (!r.ok) throw new Error(`createUser ${email}: ${r.status} ${await r.text()}`);
}

const apps: FirebaseApp[] = [];
async function client(email?: string): Promise<Firestore> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-key' }, `c${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (email) {
    const auth = getAuth(app);
    connectAuthEmulator(auth, AUTH, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, email, 'test-password-123');
  }
  return db;
}

async function allowed(p: Promise<unknown>) {
  await expect(p).resolves.not.toThrow();
}
async function denied(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: 'permission-denied' });
}

const ids = (k: string, n: number) => Array.from({ length: n }, (_, i) => `${k}${i + 1}`);
const meta: MatchMeta = {
  oversPerInnings: 2,
  battingFirst: 'A',
  toss: { winner: 'A', choice: 'bat' },
  teamA: { name: 'Tigers', playerIds: ids('a', 15) },
  teamB: { name: 'Lions', playerIds: ids('b', 15) },
};
const start: MatchEvent[] = [
  { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
  { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
];

describe.skipIf(!ON)('firestore.rules on the emulator', () => {
  let admin: Firestore, scorer: Firestore, stranger: Firestore, viewer: Firestore;

  beforeAll(async () => {
    await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await createUser(ADMIN_UID, 'admin@test.local');
    await createUser(SCORER_UID, 'scorer@test.local');
    await createUser(STRANGER_UID, 'stranger@test.local');
    admin = await client('admin@test.local');
    scorer = await client('scorer@test.local');
    stranger = await client('stranger@test.local');
    viewer = await client();
  }, 30_000);

  afterAll(async () => {
    await Promise.all(apps.map((a) => deleteApp(a)));
  });

  describe('players', () => {
    it('admin can add a player, with or without a photo', async () => {
      await allowed(setDoc(doc(admin, 'players', 'p1'), playerDoc({ name: 'Rakib', active: true })));
      await allowed(setDoc(doc(admin, 'players', 'p2'), playerDoc({ name: 'Rahim', active: true, photo: 'data:image/webp;base64,UklGRiQAAABXRUJQ' })));
      await allowed(setDoc(doc(admin, 'players', 'p2'), playerDoc({ name: 'Rahim K', active: false, photo: null })));
    });
    it('rejects SVG, external and oversized photos even from the admin', async () => {
      await denied(setDoc(doc(admin, 'players', 'p3'), playerDoc({ name: 'X', active: true, photo: 'data:image/svg+xml;base64,PHN2Zz4=' })));
      await denied(setDoc(doc(admin, 'players', 'p3'), playerDoc({ name: 'X', active: true, photo: 'https://evil.example/x.jpg' })));
      await denied(setDoc(doc(admin, 'players', 'p3'), playerDoc({ name: 'X', active: true, photo: 'data:image/jpeg;base64,' + 'A'.repeat(100_001) })));
    });
    it('rejects unknown fields and bad names', async () => {
      await denied(setDoc(doc(admin, 'players', 'p4'), { ...playerDoc({ name: 'X', active: true }), isAdmin: true }));
      await denied(setDoc(doc(admin, 'players', 'p4'), playerDoc({ name: '', active: true })));
      await denied(setDoc(doc(admin, 'players', 'p4'), playerDoc({ name: 'x'.repeat(41), active: true })));
    });
    it('scorer, strangers and logged-out visitors cannot touch players', async () => {
      await denied(setDoc(doc(scorer, 'players', 'p5'), playerDoc({ name: 'Hack', active: true })));
      await denied(setDoc(doc(stranger, 'players', 'p5'), playerDoc({ name: 'Hack', active: true })));
      await denied(setDoc(doc(viewer, 'players', 'p5'), playerDoc({ name: 'Hack', active: true })));
      await denied(deleteDoc(doc(scorer, 'players', 'p1')));
    });
    it('everyone can read players', async () => {
      const snap = await getDoc(doc(viewer, 'players', 'p1'));
      expect(snap.data()?.name).toBe('Rakib');
    });
    it('admin can delete a player', async () => {
      await allowed(deleteDoc(doc(admin, 'players', 'p2')));
    });
  });

  describe('settings', () => {
    it('admin can save settings, others cannot', async () => {
      await allowed(setDoc(doc(admin, 'config', 'app'), configDoc(DEFAULT_AWARDS_CONFIG, 12)));
      await denied(setDoc(doc(scorer, 'config', 'app'), configDoc(DEFAULT_AWARDS_CONFIG, 12)));
      await denied(setDoc(doc(viewer, 'config', 'app'), configDoc(DEFAULT_AWARDS_CONFIG, 12)));
      await denied(setDoc(doc(admin, 'config', 'other'), configDoc(DEFAULT_AWARDS_CONFIG, 12)));
      await denied(deleteDoc(doc(admin, 'config', 'app')));
    });
  });

  describe('matches', () => {
    it('scorer and admin can create a match; others cannot', async () => {
      await allowed(setDoc(doc(scorer, 'matches', 'm1'), newMatchDoc(meta, start, SCORER_UID)));
      await allowed(setDoc(doc(admin, 'matches', 'm2'), newMatchDoc(meta, start, ADMIN_UID)));
      await denied(setDoc(doc(viewer, 'matches', 'm3'), newMatchDoc(meta, start, 'nobody')));
      await denied(setDoc(doc(stranger, 'matches', 'm3'), newMatchDoc(meta, start, STRANGER_UID)));
    });
    it('a new match must start live at version 1, created by the writer', async () => {
      await denied(setDoc(doc(scorer, 'matches', 'm4'), { ...newMatchDoc(meta, start, SCORER_UID), version: 2 }));
      await denied(setDoc(doc(scorer, 'matches', 'm4'), { ...newMatchDoc(meta, start, SCORER_UID), status: 'done' }));
      await denied(setDoc(doc(scorer, 'matches', 'm4'), newMatchDoc(meta, start, ADMIN_UID)));
    });
    it('scores a full 2-over innings ball by ball, each write bumping the version', async () => {
      const events: MatchEvent[] = [...start];
      let version = 1;
      const balls = [1, 4, 0, 6, 2, 1];
      for (const r of balls) {
        events.push({ kind: 'ball', inn: 1, runsBat: r, ...(r === 4 || r === 6 ? { boundary: true } : {}), ts: Date.now() });
        version += 1;
        await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, version)));
      }
      events.push({ kind: 'setBowler', inn: 1, bowlerId: 'b2' });
      events.push({ kind: 'ball', inn: 1, runsBat: 0, extra: { type: 'wd', runs: 0 } });
      events.push({
        kind: 'ball',
        inn: 1,
        runsBat: 0,
        wicket: { how: 'caught', outId: 'a2', fielderId: 'b5', newBatterId: 'a3' },
        oops: [{ type: 'drop', fielderId: 'b7' }],
      });
      version += 1;
      await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, version)));
      // UNDO: same list minus the last entry, version still goes up.
      version += 1;
      await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events.slice(0, -1), version)));
      version += 1;
      await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, version)));

      // What a viewer reads back passes the app's own checks and replays correctly.
      const snap = await getDoc(doc(viewer, 'matches', 'm1'));
      const m = sanitizeMatch(snap.id, snap.data());
      expect(m).not.toBeNull();
      expect(m!.clean.dropped).toBe(0);
      const s = replay(m!.meta, m!.clean.events);
      expect(s.innings[0].runs).toBe(15);
      expect(s.innings[0].wickets).toBe(1);
      expect(m!.version).toBe(version);
    });
    it('rejects a stale version (two phones scoring at once)', async () => {
      const snap = await getDoc(doc(scorer, 'matches', 'm1'));
      const v = snap.data()!.version as number;
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(snap.data()!.events, v)));
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(snap.data()!.events, v + 2)));
    });
    it('creator and creation time can never change', async () => {
      const snap = await getDoc(doc(scorer, 'matches', 'm1'));
      const v = snap.data()!.version as number;
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), { ...matchUpdate(snap.data()!.events, v + 1), createdBy: ADMIN_UID }));
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), { ...matchUpdate(snap.data()!.events, v + 1), extra: 'x' }));
    });
    it('logged-out visitors and strangers cannot score', async () => {
      const snap = await getDoc(doc(viewer, 'matches', 'm1'));
      const v = snap.data()!.version as number;
      await denied(updateDoc(doc(viewer, 'matches', 'm1'), matchUpdate([], v + 1)));
      await denied(updateDoc(doc(stranger, 'matches', 'm1'), matchUpdate([], v + 1)));
    });
    it('finishing locks the match for the scorer; only the admin can reopen or delete', async () => {
      let v = (await getDoc(doc(scorer, 'matches', 'm1'))).data()!.version as number;
      const events = (await getDoc(doc(scorer, 'matches', 'm1'))).data()!.events;
      await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, ++v, 'done')));
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, v + 1)));
      await denied(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, v + 1, 'live')));
      await denied(deleteDoc(doc(scorer, 'matches', 'm1')));
      await allowed(updateDoc(doc(admin, 'matches', 'm1'), matchUpdate(events, ++v, 'live')));
      await allowed(updateDoc(doc(scorer, 'matches', 'm1'), matchUpdate(events, ++v)));
      await allowed(deleteDoc(doc(admin, 'matches', 'm1')));
    });
    it('rejects too many events and bad team sizes', async () => {
      const big = Array.from({ length: 2001 }, () => ({ kind: 'swapStrike', inn: 1 }));
      await denied(setDoc(doc(scorer, 'matches', 'm5'), newMatchDoc(meta, big as MatchEvent[], SCORER_UID)));
      const tooBig: MatchMeta = { ...meta, teamA: { name: 'Tigers', playerIds: ids('a', 31) } };
      await denied(setDoc(doc(scorer, 'matches', 'm5'), newMatchDoc(tooBig, start, SCORER_UID)));
    });
  });
});
