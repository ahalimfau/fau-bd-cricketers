import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { browserLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config/firebaseConfig';

// Only email/password sign-in is used, so Auth is initialised without the
// popup/redirect resolver. That keeps Google's sign-in iframe and its extra
// scripts out of the app, which lets the Content Security Policy forbid all
// frames and third-party scripts. No Analytics or other trackers are loaded.

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // Offline cache: balls scored with no signal are queued and sync later.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  auth = initializeAuth(app, { persistence: browserLocalPersistence });
}

export { app, db, auth, isFirebaseConfigured };
