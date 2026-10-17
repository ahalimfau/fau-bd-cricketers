// UNDO, Edit ball and Delete ball applied to the list exactly as stored.
//
// The screen works with the cleaned list (validate.ts drops anything
// unrecognised), so position i on screen maps to sourceIndex[i] in storage.
// Writing through that map means a fix never shifts or loses other entries.

import type { MatchEvent } from '../engine/types';
import type { CleanEvents } from './validate';

export type Op =
  | { type: 'append'; events: MatchEvent[] }
  | { type: 'undo' }
  | { type: 'replace'; index: number; event: MatchEvent }
  | { type: 'delete'; index: number }
  | { type: 'none' };

export function applyOp(raw: unknown[], clean: CleanEvents, op: Op): unknown[] {
  switch (op.type) {
    case 'append':
      return [...raw, ...op.events];
    case 'undo': {
      const at = clean.sourceIndex[clean.sourceIndex.length - 1];
      if (at === undefined) return raw.slice();
      return [...raw.slice(0, at), ...raw.slice(at + 1)];
    }
    case 'replace': {
      const at = clean.sourceIndex[op.index];
      if (at === undefined) throw new RangeError(`No event at ${op.index}`);
      const cur = clean.events[op.index];
      if (cur.inn !== op.event.inn) throw new Error('An edit cannot move an event to the other innings');
      const next = raw.slice();
      next[at] = op.event;
      return next;
    }
    case 'delete': {
      const at = clean.sourceIndex[op.index];
      if (at === undefined) throw new RangeError(`No event at ${op.index}`);
      return [...raw.slice(0, at), ...raw.slice(at + 1)];
    }
    case 'none':
      return raw.slice();
  }
}
