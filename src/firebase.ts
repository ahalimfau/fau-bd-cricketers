import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { browserLocalPersistence, connectAuthEmulator, initializeAuth, type Auth } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config/firebaseConfig';

// Only email/password sign-in is used, so Auth is initialised without the
// popup/redirect resolver. That keeps Google's sign-in iframe and its extra
// scripts out of the app, which lets the Content Security Policy forbid all
// frames and third-party scripts. No Analytics or other trackers are loaded.

// Local testing only: `VITE_EMULATOR=1 npm run dev` talks to the Firebase
// emulators on this computer instead of the real project. In a normal build
// this flag is absent and the branch below is removed entirely.
const useEmulator = import.meta.env.VITE_EMULATOR === '1';

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

if (isFirebaseConfigured) {
  app = initializeApp(useEmulator ? { ...firebaseConfig, projectId: 'demo-fau-bd' } : firebaseConfig);
  // Offline cache: balls scored with no signal are queued and sync later.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Optional fields left undefined are simply not written.
    ignoreUndefinedProperties: true,
  });
  auth = initializeAuth(app, { persistence: browserLocalPersistence });
  if (useEmulator) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
}

export { app, db, auth, isFirebaseConfigured };
