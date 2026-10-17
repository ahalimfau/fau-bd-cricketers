import { describe, expect, it } from 'vitest';
import { cleanText, sanitizeConfig, sanitizeEvents, sanitizeMeta, sanitizePlayer } from './validate';
import { isSafePhotoDataUrl } from '../security/photo';
import { replay } from '../engine/replay';
import type { MatchMeta } from '../engine/types';

const meta: MatchMeta = {
  oversPerInnings: 2,
  teamA: { name: 'Tigers', playerIds: ['a1', 'a2', 'a3'] },
  teamB: { name: 'Lions', playerIds: ['b1', 'b2', 'b3'] },
  battingFirst: 'A',
};

describe('cleanText', () => {
  it('strips control and bidi-override characters and trims', () => {
    expect(cleanText('  Ra‮him\u0000  ', 40)).toBe('Rahim');
    expect(cleanText('a   b', 40)).toBe('a b');
  });
  it('rejects empty, too long and non-strings', () => {
    expect(cleanText('   ', 40)).toBeNull();
    expect(cleanText('x'.repeat(41), 40)).toBeNull();
    expect(cleanText(42, 40)).toBeNull();
  });
  it('keeps markup as plain text (React shows it literally, never runs it)', () => {
    expect(cleanText('<img src=x onerror=alert(1)>', 40)).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('photos', () => {
  it('accepts only base64 WebP/JPEG data URLs', () => {
    expect(isSafePhotoDataUrl('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isSafePhotoDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });
  it('rejects SVG, external URLs, javascript: and junk', () => {
    expect(isSafePhotoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafePhotoDataUrl('https://evil.example/x.jpg')).toBe(false);
    expect(isSafePhotoDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePhotoDataUrl('data:image/webp;base64,abc"onerror="x')).toBe(false);
    expect(isSafePhotoDataUrl('data:image/webp;base64,' + 'A'.repeat(100_000))).toBe(false);
  });
});

describe('sanitizePlayer', () => {
  it('keeps known fields only', () => {
    const p = sanitizePlayer('abc123', { name: 'Rakib', active: true, isAdmin: true, __proto__: { x: 1 } });
    expect(p).toEqual({ id: 'abc123', name: 'Rakib', active: true });
  });
  it('drops an unsafe photo but keeps the player', () => {
    expect(sanitizePlayer('p1', { name: 'Rakib', photo: 'data:image/svg+xml;base64,AAAA' })?.photo).toBeUndefined();
  });
  it('rejects bad ids and names', () => {
    expect(sanitizePlayer('../../etc', { name: 'x' })).toBeNull();
    expect(sanitizePlayer('p1', { name: '' })).toBeNull();
  });
});

describe('sanitizeMeta', () => {
  it('accepts a valid match', () => {
    expect(sanitizeMeta(meta)).toEqual(meta);
  });
  it('rejects a player on both teams, silly overs and duplicate ids', () => {
    expect(sanitizeMeta({ ...meta, teamB: { name: 'L', playerIds: ['a1', 'b2'] } })).toBeNull();
    expect(sanitizeMeta({ ...meta, oversPerInnings: 500 })).toBeNull();
    expect(sanitizeMeta({ ...meta, teamA: { name: 'T', playerIds: ['a1', 'a1', 'a2'] } })).toBeNull();
  });
});

describe('sanitizeEvents', () => {
  const good = [
    { kind: 'setOpeners', inn: 1, strikerId: 'a1', nonStrikerId: 'a2' },
    { kind: 'setBowler', inn: 1, bowlerId: 'b1' },
    { kind: 'ball', inn: 1, runsBat: 4, boundary: true },
  ];

  it('passes good events through unchanged', () => {
    const r = sanitizeEvents(good, meta);
    expect(r.events).toEqual(good);
    expect(r.dropped).toBe(0);
  });

  it('drops malformed or hostile events and keeps the index map right', () => {
    const raw = [
      good[0],
      good[1],
      { kind: 'ball', inn: 1, runsBat: 'abc' }, // wrong type
      { kind: 'ball', inn: 1, runsBat: 1e9 }, // absurd runs
      { kind: 'ball', inn: 1, runsBat: 0, wicket: { how: 'caught', outId: 'b1' } }, // fielder "out" while batting side is A
      { kind: 'setBowler', inn: 1, bowlerId: 'a1' }, // batter can't bowl
      { kind: 'deleteEverything', inn: 1 },
      null,
      good[2],
    ];
    const r = sanitizeEvents(raw, meta);
    expect(r.events).toEqual(good);
    expect(r.sourceIndex).toEqual([0, 1, 8]);
    expect(r.dropped).toBe(6);
  });

  it('never copies unknown fields', () => {
    const r = sanitizeEvents([{ ...good[2], injected: '<script>', extraField: 1 }], meta);
    expect(r.events[0]).toEqual({ kind: 'ball', inn: 1, runsBat: 4, boundary: true });
  });

  it('cleaned events replay without crashing', () => {
    const s = replay(meta, sanitizeEvents(good, meta).events);
    expect(s.innings[0].runs).toBe(4);
  });

  it('non-arrays give an empty list', () => {
    expect(sanitizeEvents('nope', meta).events).toEqual([]);
  });
});

describe('sanitizeConfig', () => {
  it('falls back to defaults and clamps values', () => {
    const c = sanitizeConfig({
      titles: { miss: { label: '  Miss‮ ', enabled: false }, bogus: { label: 'x' } },
      shahinWeights: { drop: 999, boundaryMisfield: 3 },
      kiptaMinBalls: -5,
    });
    expect(c.titles.miss).toEqual({ label: 'Miss', enabled: false });
    expect(c.shahinWeights).toEqual({ drop: 6, boundaryMisfield: 3, otherOops: 2 });
    expect(c.kiptaMinBalls).toBe(12);
    expect('bogus' in c.titles).toBe(false);
  });
});
