/**
 * Auth store.
 *
 * Holds `{ user, accessToken }` and is deliberately NOT persisted (§7). The
 * access token lives in memory only so XSS cannot lift it out of localStorage;
 * a reload recovers the session from the HttpOnly refresh cookie instead.
 */

import { create } from 'zustand';

import { restoreSession, setAccessToken } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  /** False until the first refresh attempt settles — guards flash-of-logged-out. */
  ready: boolean;
  setSession: (user: User, accessToken: string) => void;
  clear: () => void;
  /** Called once on mount. Safe to call repeatedly; the client dedupes. */
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, ready: true });
  },

  clear: () => {
    setAccessToken(null);
    set({ user: null, ready: true });
  },

  restore: async () => {
    const user = await restoreSession();
    set({ user, ready: true });
  },
}));
