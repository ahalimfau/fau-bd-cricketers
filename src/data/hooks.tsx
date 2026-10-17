// Live data from Firestore as React hooks. Every document goes through the
// sanitizers in validate.ts before any screen sees it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { roleOf, type Role } from '../config/roles';
import { DEFAULT_AWARDS_CONFIG, type AwardsConfig } from '../engine/awards';
import { replay } from '../engine/replay';
import type { PlayedMatch } from '../engine/career';
import {
  DEFAULT_OVERS,
  sanitizeConfig,
  sanitizeDefaultOvers,
  sanitizeMatch,
  sanitizePlayer,
  type MatchDoc,
  type Player,
} from './validate';

// ---------- Auth ----------

export interface AuthInfo {
  ready: boolean;
  uid: string | null;
  email: string | null;
  role: Role;
}

export async function signIn(email: string, password: string) {
  if (!auth) throw new Error('Firebase is not configured.');
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut() {
  if (auth) await fbSignOut(auth);
}

export function signInErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
    return 'Wrong email or password.';
  }
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
  if (code === 'auth/user-disabled') return 'This login has been switched off by the admin.';
  if (code === 'auth/network-request-failed') return 'No connection. Signing in needs the internet.';
  return `Couldn't sign in (${code || 'unknown error'}).`;
}

// ---------- Shared app data: who's signed in, players, settings ----------

interface AppData {
  auth: AuthInfo;
  players: Player[];
  playersReady: boolean;
  byId: Map<string, Player>;
  name: (id: string | undefined) => string;
  cfg: AwardsConfig;
  defaultOvers: number;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [authInfo, setAuth] = useState<AuthInfo>({ ready: !auth, uid: null, email: null, role: 'viewer' });
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersReady, setPlayersReady] = useState(false);
  const [cfg, setCfg] = useState<AwardsConfig>(DEFAULT_AWARDS_CONFIG);
  const [defaultOvers, setDefaultOvers] = useState(DEFAULT_OVERS);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) =>
      setAuth({ ready: true, uid: u?.uid ?? null, email: u?.email ?? null, role: roleOf(u?.uid) }),
    );
  }, []);

  useEffect(() => {
    if (!db) return;
    const unsubPlayers = onSnapshot(
      collection(db, 'players'),
      (snap) => {
        const list: Player[] = [];
        snap.forEach((d) => {
          const p = sanitizePlayer(d.id, d.data());
          if (p) list.push(p);
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPlayers(list);
        setPlayersReady(true);
      },
      () => setPlayersReady(true),
    );
    const unsubCfg = onSnapshot(
      doc(db, 'config', 'app'),
      (snap) => {
        const raw = snap.data();
        setCfg(sanitizeConfig(raw));
        setDefaultOvers(sanitizeDefaultOvers(raw));
      },
      () => undefined,
    );
    return () => {
      unsubPlayers();
      unsubCfg();
    };
  }, []);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const name = useCallback((id: string | undefined) => (id && byId.get(id)?.name) || 'Unknown', [byId]);

  const value = useMemo<AppData>(
    () => ({ auth: authInfo, players, playersReady, byId, name, cfg, defaultOvers }),
    [authInfo, players, playersReady, byId, name, cfg, defaultOvers],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppDataProvider');
  return v;
}

// ---------- Matches ----------

export interface MatchList {
  matches: MatchDoc[];
  ready: boolean;
  error: string | null;
}

/**
 * Most recent matches, newest first. Filtering (e.g. finished only) is done by
 * the caller, so Firestore needs no extra index.
 */
export function useMatches(max = 100): MatchList {
  const [state, setState] = useState<MatchList>({ matches: [], ready: false, error: null });
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(max));
    return onSnapshot(
      q,
      (snap) => {
        const list: MatchDoc[] = [];
        snap.forEach((d) => {
          const m = sanitizeMatch(d.id, d.data({ serverTimestamps: 'estimate' }));
          if (m) list.push(m);
        });
        setState({ matches: list, ready: true, error: null });
      },
      (e) => setState((s) => ({ ...s, ready: true, error: e.code })),
    );
  }, [max]);
  return state;
}

/** Finished matches, replayed and ready for stats (newest first). */
export function usePlayedMatches(): { list: PlayedMatch[]; ready: boolean; error: string | null } {
  const { matches, ready, error } = useMatches(300);
  const list = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'done')
        .map((m) => ({ id: m.id, meta: m.meta, state: replay(m.meta, m.clean.events), createdAt: m.createdAt })),
    [matches],
  );
  return { list, ready, error };
}

export interface LiveMatch {
  match: MatchDoc | null;
  ready: boolean;
  missing: boolean;
  /** Local changes not yet confirmed by the server (e.g. no signal). */
  pending: boolean;
  error: string | null;
}

export function useMatch(id: string | undefined): LiveMatch {
  const [state, setState] = useState<LiveMatch>({ match: null, ready: false, missing: false, pending: false, error: null });
  useEffect(() => {
    if (!db || !id) return;
    setState({ match: null, ready: false, missing: false, pending: false, error: null });
    return onSnapshot(
      doc(db, 'matches', id),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists()) {
          // A brand-new match can briefly look missing before the cache has it.
          setState({ match: null, ready: !snap.metadata.fromCache, missing: !snap.metadata.fromCache, pending: false, error: null });
          return;
        }
        const m = sanitizeMatch(snap.id, snap.data({ serverTimestamps: 'estimate' }));
        setState({
          match: m,
          ready: true,
          missing: !m,
          pending: snap.metadata.hasPendingWrites,
          error: m ? null : 'This match data is damaged and cannot be shown.',
        });
      },
      (e) => setState((s) => ({ ...s, ready: true, error: e.code })),
    );
  }, [id]);
  return state;
}
