// Rules for building the two teams before a match.
//
// A team's captain is always the first id in its list. The match document
// stores teams as { name, playerIds }, so keeping the captain first records
// who captained without changing the stored format (or the security rules).

import type { TeamKey } from '../engine/types';

export const MAX_TEAM = 12;
export const MIN_TEAM = 2;

export interface TeamDraft {
  name: string;
  /** Captain first, then the other players in the order they were picked. */
  ids: string[];
}

export type Teams = Record<TeamKey, TeamDraft>;

export const other = (k: TeamKey): TeamKey => (k === 'A' ? 'B' : 'A');

export function captainOf(t: TeamDraft): string | undefined {
  return t.ids[0];
}

/** Which team (if any) a player is already on. */
export function teamOfPlayer(teams: Teams, id: string): TeamKey | null {
  if (teams.A.ids.includes(id)) return 'A';
  if (teams.B.ids.includes(id)) return 'B';
  return null;
}

/**
 * Makes `id` the captain of team k. The old captain stays in the team as a
 * player. Refused (teams unchanged) if the player is on the other team, or if
 * the team is full and the new captain isn't already in it.
 */
export function setCaptain(teams: Teams, k: TeamKey, id: string): Teams {
  if (teams[other(k)].ids.includes(id)) return teams;
  const t = teams[k];
  const rest = t.ids.filter((x) => x !== id);
  if (!t.ids.includes(id) && t.ids.length >= MAX_TEAM) return teams;
  return { ...teams, [k]: { ...t, ids: [id, ...rest] } };
}

/**
 * Adds or removes a (non-captain) player. Refused if there's no captain yet,
 * the player is the captain, plays for the other team, or the team is full.
 */
export function togglePlayer(teams: Teams, k: TeamKey, id: string): Teams {
  const t = teams[k];
  if (t.ids.length === 0 || t.ids[0] === id) return teams;
  if (teams[other(k)].ids.includes(id)) return teams;
  if (t.ids.includes(id)) return { ...teams, [k]: { ...t, ids: t.ids.filter((x) => x !== id) } };
  if (t.ids.length >= MAX_TEAM) return teams;
  return { ...teams, [k]: { ...t, ids: [...t.ids, id] } };
}

/** Drops players who no longer exist (deleted or hidden) and keeps the rules intact. */
export function cleanTeams(teams: Teams, validIds: Set<string>): Teams {
  const fix = (t: TeamDraft, taken: Set<string>): TeamDraft => {
    const ids = t.ids.filter((id, i, all) => validIds.has(id) && !taken.has(id) && all.indexOf(id) === i).slice(0, MAX_TEAM);
    return { name: t.name, ids };
  };
  const A = fix(teams.A, new Set());
  const B = fix(teams.B, new Set(A.ids));
  return { A, B };
}

export function teamReady(t: TeamDraft): boolean {
  return t.ids.length >= MIN_TEAM && t.ids.length <= MAX_TEAM && t.name.trim().length > 0;
}

export function namesClash(teams: Teams): boolean {
  return teams.A.name.trim().toLowerCase() === teams.B.name.trim().toLowerCase();
}
