// Firebase web config from Firebase console > Project settings > Your apps.
//
// These values are NOT secrets: every Firebase web app ships them to the
// browser. Your data is protected by firestore.rules and by sign-up being
// disabled, not by hiding this object.
//
// measurementId (Google Analytics) is deliberately left out: the app loads no
// tracking scripts and the Content Security Policy would block them anyway.

export const firebaseConfig = {
  apiKey: 'AIzaSyABSIIZJBxmH_lIuZzbbbjtBAitkpSiyfM',
  authDomain: 'fau-bd-cricketers.firebaseapp.com',
  projectId: 'fau-bd-cricketers',
  storageBucket: 'fau-bd-cricketers.firebasestorage.app',
  messagingSenderId: '1012773954379',
  appId: '1:1012773954379:web:cb44d7329966c8b378fece',
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((v) => v.includes('PASTE_'));
