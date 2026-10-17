import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_UID, SCORER_UID, roleOf } from './roles';

// Guards against the app and the server rules disagreeing about who is admin.
describe('roles', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

  it('firestore.rules uses the same admin and scorer UIDs as the app', () => {
    expect(rules).toContain(`request.auth.uid == '${ADMIN_UID}'`);
    expect(rules).toContain(`request.auth.uid == '${SCORER_UID}'`);
    expect(ADMIN_UID).not.toBe(SCORER_UID);
  });

  it('maps UIDs to roles', () => {
    expect(roleOf(ADMIN_UID)).toBe('admin');
    expect(roleOf(SCORER_UID)).toBe('scorer');
    expect(roleOf('someone-else')).toBe('viewer');
    expect(roleOf(null)).toBe('viewer');
  });
});
