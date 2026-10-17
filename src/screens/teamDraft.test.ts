import { describe, expect, it } from 'vitest';
import { MAX_TEAM, captainOf, cleanTeams, setCaptain, teamOfPlayer, teamReady, togglePlayer, type Teams } from './teamDraft';

const empty = (): Teams => ({ A: { name: 'Tigers', ids: [] }, B: { name: 'Lions', ids: [] } });

describe('team picking', () => {
  it('captain comes first and players follow', () => {
    let t = setCaptain(empty(), 'A', 'p1');
    t = togglePlayer(t, 'A', 'p2');
    t = togglePlayer(t, 'A', 'p3');
    expect(t.A.ids).toEqual(['p1', 'p2', 'p3']);
    expect(captainOf(t.A)).toBe('p1');
  });

  it('players cannot be added before a captain is chosen', () => {
    expect(togglePlayer(empty(), 'A', 'p1').A.ids).toEqual([]);
  });

  it('changing captain keeps the old captain as a player', () => {
    let t = setCaptain(empty(), 'A', 'p1');
    t = togglePlayer(t, 'A', 'p2');
    t = setCaptain(t, 'A', 'p2');
    expect(t.A.ids).toEqual(['p2', 'p1']);
    t = setCaptain(t, 'A', 'p9');
    expect(t.A.ids).toEqual(['p9', 'p2', 'p1']);
  });

  it('the captain cannot be removed by tapping', () => {
    const t = setCaptain(empty(), 'A', 'p1');
    expect(togglePlayer(t, 'A', 'p1').A.ids).toEqual(['p1']);
  });

  it('a player can only be on one team', () => {
    let t = setCaptain(empty(), 'A', 'p1');
    t = togglePlayer(t, 'A', 'p2');
    t = setCaptain(t, 'B', 'p2');
    expect(t.B.ids).toEqual([]);
    t = setCaptain(t, 'B', 'p5');
    t = togglePlayer(t, 'B', 'p1');
    expect(t.B.ids).toEqual(['p5']);
    expect(teamOfPlayer(t, 'p2')).toBe('A');
    expect(teamOfPlayer(t, 'p5')).toBe('B');
    expect(teamOfPlayer(t, 'zz')).toBeNull();
  });

  it(`stops at ${MAX_TEAM} players including the captain`, () => {
    let t = setCaptain(empty(), 'A', 'c');
    for (let i = 0; i < 20; i++) t = togglePlayer(t, 'A', `p${i}`);
    expect(t.A.ids).toHaveLength(MAX_TEAM);
    // A full team can't take an outside captain either.
    expect(setCaptain(t, 'A', 'outsider').A.ids).toEqual(t.A.ids);
    // But a player already in the team can become captain.
    expect(setCaptain(t, 'A', 'p3').A.ids[0]).toBe('p3');
    expect(setCaptain(t, 'A', 'p3').A.ids).toHaveLength(MAX_TEAM);
  });

  it('removing a player frees a slot', () => {
    let t = setCaptain(empty(), 'A', 'c');
    t = togglePlayer(t, 'A', 'p1');
    t = togglePlayer(t, 'A', 'p1');
    expect(t.A.ids).toEqual(['c']);
  });

  it('a team needs at least 2 players and a name', () => {
    let t = setCaptain(empty(), 'A', 'c');
    expect(teamReady(t.A)).toBe(false);
    t = togglePlayer(t, 'A', 'p1');
    expect(teamReady(t.A)).toBe(true);
    expect(teamReady({ ...t.A, name: '  ' })).toBe(false);
  });

  it('cleanTeams drops missing players and duplicates across teams', () => {
    const t: Teams = { A: { name: 'A', ids: ['c', 'gone', 'x', 'x'] }, B: { name: 'B', ids: ['x', 'y'] } };
    const c = cleanTeams(t, new Set(['c', 'x', 'y']));
    expect(c.A.ids).toEqual(['c', 'x']);
    expect(c.B.ids).toEqual(['y']);
  });
});
