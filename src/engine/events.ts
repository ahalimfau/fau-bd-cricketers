import type { MatchEvent } from './types';

// Pure list operations behind UNDO, Edit ball and Delete ball. Because every
// number is recomputed from the list, these four are all that's needed to fix
// any mistake; the data layer wraps each in one Firestore transaction.

export function appendEvent(events: MatchEvent[], e: MatchEvent): MatchEvent[] {
  return [...events, e];
}

export function undoLast(events: MatchEvent[]): MatchEvent[] {
  return events.slice(0, -1);
}

export function replaceEvent(events: MatchEvent[], index: number, e: MatchEvent): MatchEvent[] {
  if (index < 0 || index >= events.length) throw new RangeError(`No event at ${index}`);
  if (events[index].inn !== e.inn) throw new Error('An edit cannot move an event to the other innings');
  const next = events.slice();
  next[index] = e;
  return next;
}

export function deleteEvent(events: MatchEvent[], index: number): MatchEvent[] {
  if (index < 0 || index >= events.length) throw new RangeError(`No event at ${index}`);
  return [...events.slice(0, index), ...events.slice(index + 1)];
}

/** Short, human description of an event, used by the undo toast. */
export function describeEvent(e: MatchEvent, name: (id: string) => string): string {
  switch (e.kind) {
    case 'ball': {
      const t = e.extra?.type;
      const r = e.extra?.runs ?? 0;
      let s: string;
      if (t === 'wd') s = r ? `Wide + ${r}` : 'Wide';
      else if (t === 'nb') s = e.runsBat ? `No-ball + ${e.runsBat} off the bat` : r ? `No-ball + ${r} ${e.extra?.nbRunsAs === 'lb' ? 'leg byes' : 'byes'}` : 'No-ball';
      else if (t === 'b') s = `${r} ${r === 1 ? 'bye' : 'byes'}`;
      else if (t === 'lb') s = `${r} ${r === 1 ? 'leg bye' : 'leg byes'}`;
      else if (e.runsBat === 0) s = 'Dot ball';
      else s = `${e.runsBat} ${e.runsBat === 1 ? 'run' : 'runs'}${e.boundary ? ' (boundary)' : ''}`;
      if (e.wicket) s += ` · ${name(e.wicket.outId)} out`;
      return s;
    }
    case 'setBowler':
      return `${name(e.bowlerId)} to bowl`;
    case 'setOpeners':
      return `Openers ${name(e.strikerId)} and ${name(e.nonStrikerId)}`;
    case 'swapStrike':
      return 'Strike swapped';
    case 'retire':
      return `${name(e.playerId)} retired`;
    case 'endInnings':
      return 'Innings ended';
    case 'oops':
      return `Fielding oops: ${name(e.oops.fielderId)}`;
  }
}
