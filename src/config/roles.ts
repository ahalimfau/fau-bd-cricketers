// The two accounts the app knows about. Replace these with the UIDs from
// Firebase console > Authentication > Users. They must match firestore.rules
// (src/config/roles.test.ts fails if they don't).
//
// This file only decides which buttons the app shows. The real permissions
// are enforced by firestore.rules on Google's servers.

export const ADMIN_UID = '3hgZ94yICEfIItvxxaQPIDNFsdQ2';
export const SCORER_UID = 'LoF4RVCdOYYsIenJuQWisowtZbJ2';

export type Role = 'admin' | 'scorer' | 'viewer';

export function roleOf(uid: string | null | undefined): Role {
  if (!uid) return 'viewer';
  if (uid === ADMIN_UID) return 'admin';
  if (uid === SCORER_UID) return 'scorer';
  return 'viewer';
}

export const canScore = (r: Role) => r === 'admin' || r === 'scorer';
export const canManage = (r: Role) => r === 'admin';
