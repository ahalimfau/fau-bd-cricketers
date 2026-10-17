import { describe, expect, it } from 'vitest';
import { applyOp } from './rawOps';
import { sanitizeEvents } from './validate';
import type { MatchMeta } from '../engine/types';

const meta: MatchMeta = {
  oversPerInnings: 2,
  battingFirst: 'A',
  teamA: { name: 'Tigers', playerIds: ['a1', 'a2', 'a3'] },
  teamB: { name: 'Lions', playerIds: ['b1', 'b2', 'b3'] },
};

// A stored list with one junk entry in the middle (index 2).
const raw: unknown[] = [
  { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
  { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
  { kind: 'hack', evil: true },
  { kind: 'ball', inn: 1, runsBat: 1 },
  { kind: 'ball', inn: 1, runsBat: 4, boundary: true },
];

describe('applyOp on the stored list', () => {
  const clean = sanitizeEvents(raw, meta);

  it('maps cleaned positions past dropped entries', () => {
    expect(clean.events).toHaveLength(4);
    expect(clean.sourceIndex).toEqual([0, 1, 3, 4]);
    expect(clean.dropped).toBe(1);
  });

  it('undo removes the last real event and keeps everything else', () => {
    const next = applyOp(raw, clean, { type: 'undo' });
    expect(next).toEqual(raw.slice(0, 4));
  });

  it('replace edits the right stored item', () => {
    const next = applyOp(raw, clean, { type: 'replace', index: 2, event: { kind: 'ball', inn: 1, runsBat: 2 } });
    expect(next[3]).toEqual({ kind: 'ball', inn: 1, runsBat: 2 });
    expect(next[2]).toEqual(raw[2]);
    expect(next).toHaveLength(5);
  });

  it('delete removes the right stored item', () => {
    const next = applyOp(raw, clean, { type: 'delete', index: 2 });
    expect(next).toEqual([raw[0], raw[1], raw[2], raw[4]]);
  });

  it('append adds to the end', () => {
    const e = { kind: 'ball' as const, inn: 1 as const, runsBat: 0 };
    expect(applyOp(raw, clean, { type: 'append', events: [e] })).toEqual([...raw, e]);
  });

  it('refuses to move an event to the other innings', () => {
    expect(() =>
      applyOp(raw, clean, { type: 'replace', index: 2, event: { kind: 'ball', inn: 2, runsBat: 1 } }),
    ).toThrow();
  });

  it('undo on an empty list is harmless', () => {
    expect(applyOp([], sanitizeEvents([], meta), { type: 'undo' })).toEqual([]);
  });

  it('never mutates the input', () => {
    const copy = structuredClone(raw);
    applyOp(raw, clean, { type: 'delete', index: 0 });
    applyOp(raw, clean, { type: 'replace', index: 3, event: { kind: 'ball', inn: 1, runsBat: 6, boundary: true } });
    expect(raw).toEqual(copy);
  });
});
