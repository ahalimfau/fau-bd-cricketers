import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { ADMIN_UID, SCORER_UID } from './config/roles';

// Setup and security check (#/check). Confirms the Firebase setup from
// SETUP.md is complete and that the security rules are live: a logged-out
// write MUST be refused by the server.

type Status = 'wait' | 'ok' | 'fail';
interface Check {
  label: string;
  status: Status;
  detail: string;
}

const uidsSet = !ADMIN_UID.startsWith('REPLACE_') && !SCORER_UID.startsWith('REPLACE_');

export function SetupCheck() {
  const [checks, setChecks] = useState<Check[]>([
    {
      label: 'Firebase config pasted',
      status: isFirebaseConfigured ? 'ok' : 'fail',
      detail: isFirebaseConfigured ? 'src/config/firebaseConfig.ts is filled in.' : 'Fill in src/config/firebaseConfig.ts (SETUP.md step 6).',
    },
    {
      label: 'Admin and scorer UIDs set',
      status: uidsSet ? 'ok' : 'fail',
      detail: uidsSet ? 'src/config/roles.ts is filled in.' : 'Fill in src/config/roles.ts and firestore.rules (SETUP.md step 6).',
    },
    { label: 'Database reachable', status: 'wait', detail: 'Checking…' },
    { label: 'Security rules block strangers', status: 'wait', detail: 'Checking…' },
  ]);

  useEffect(() => {
    const set = (i: number, status: Status, detail: string) =>
      setChecks((c) => c.map((x, j) => (j === i ? { ...x, status, detail } : x)));
    if (!db) {
      set(2, 'fail', 'Skipped: Firebase is not configured yet.');
      set(3, 'fail', 'Skipped: Firebase is not configured yet.');
      return;
    }
    const store = db;
    getDocs(query(collection(store, 'players'), limit(1)))
      .then(() => set(2, 'ok', 'Public read works (needed for live viewing).'))
      .catch((e: { code?: string }) => set(2, 'fail', `Couldn't read the database (${e.code ?? 'error'}). Are the rules published?`));

    // The probe only proves something when nobody is signed in on this phone.
    const probe = doc(store, 'players', 'security-probe');
    (auth ? auth.authStateReady() : Promise.resolve())
      .then(() => {
        if (auth?.currentUser) throw Object.assign(new Error('signed in'), { code: 'signed-in' });
        return setDoc(probe, { name: 'probe', active: false });
      })
      .then(async () => {
        set(3, 'fail', 'DANGER: a logged-out visitor could write. Publish firestore.rules now (SETUP.md step 7).');
        await deleteDoc(probe).catch(() => undefined);
      })
      .catch((e: { code?: string }) => {
        if (e.code === 'signed-in') set(3, 'wait', 'Sign out first (or open this page in a private window) to run this check.');
        else if (e.code === 'permission-denied') set(3, 'ok', 'A logged-out write was refused by the server.');
        else set(3, 'fail', `Unexpected result (${e.code ?? 'error'}).`);
      });
  }, []);

  const allOk = checks.every((c) => c.status === 'ok');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-5 px-[clamp(16px,5vw,24px)] pt-8 pb-[max(24px,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-[clamp(26px,8vw,32px)] leading-tight font-extrabold">
        <span className="text-green">FAU BD</span> Cricketers
      </h1>
      <p className="text-muted">Setup and security check.</p>
      <ul className="flex flex-col gap-3">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex flex-col gap-1 rounded-2xl p-4 ${
              c.status === 'ok' ? 'bg-green-tint' : c.status === 'fail' ? 'bg-red-tint' : 'bg-surface'
            }`}
          >
            <span className={`font-bold ${c.status === 'ok' ? 'text-green-dark' : c.status === 'fail' ? 'text-red-dark' : ''}`}>
              {c.status === 'ok' ? '✓ ' : c.status === 'fail' ? '✗ ' : '… '}
              {c.label}
            </span>
            <span className="text-sm">{c.detail}</span>
          </li>
        ))}
      </ul>
      {allOk && <p className="font-bold text-green-dark">Everything is set up and locked down.</p>}
      {isFirebaseConfigured && (
        <a href="#/" className="font-bold text-green-dark underline">
          Back to the app
        </a>
      )}
    </main>
  );
}
