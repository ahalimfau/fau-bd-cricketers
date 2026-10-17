import { useCallback, useRef } from 'react';
import { applyOp, type Op } from './rawOps';
import { writeErrorText, writeMatch } from './repo';
import { sanitizeEvents, type MatchDoc, type MatchStatus } from './validate';

interface Base {
  id: string;
  raw: unknown[];
  version: number;
}

/**
 * Sends scoring changes to Firestore.
 *
 * Each write must carry version = stored version + 1 (enforced by the rules,
 * so two phones can't overwrite each other). Fast double taps can happen
 * before the screen has re-rendered, so the last written list and version are
 * remembered here and used as the base for the next tap. If the server ever
 * refuses a write, that memory is dropped and the next tap starts again from
 * what the server has.
 */
export function useMatchWriter(match: MatchDoc | null, onError: (msg: string) => void) {
  const latest = useRef<Base | null>(null);

  return useCallback(
    (op: Op, status?: MatchStatus) => {
      if (!match) return;
      const l = latest.current;
      const base: Base =
        l && l.id === match.id && l.version > match.version
          ? l
          : { id: match.id, raw: match.raw, version: match.version };
      const clean = sanitizeEvents(base.raw, match.meta);
      let raw: unknown[];
      try {
        raw = applyOp(base.raw, clean, op);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'That change could not be applied.');
        return;
      }
      const next: Base = { id: match.id, raw, version: base.version + 1 };
      latest.current = next;
      writeMatch(match.id, raw, next.version, status).catch((e) => {
        if (latest.current === next || (latest.current && latest.current.version >= next.version)) latest.current = null;
        onError(writeErrorText(e));
      });
    },
    [match, onError],
  );
}
