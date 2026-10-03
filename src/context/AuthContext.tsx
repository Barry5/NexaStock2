import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribeAuthState, type AuthState } from '../lib/authService';
import type { SyncScope } from '../lib/firebaseSync';

interface AuthContextValue {
  authState: AuthState;
  /** Périmètre de synchronisation : null tant que l'utilisateur n'est pas connecté et rattaché. */
  scope: SyncScope | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading', uid: null, email: null, link: null });

  useEffect(() => subscribeAuthState(setAuthState), []);

  const scope = useMemo<SyncScope | null>(() => {
    const link = authState.link;
    if (!authState.uid || !link) return null;
    if (authState.status !== 'signedIn' && authState.status !== 'loading') return null;
    return {
      uid: authState.uid,
      userId: link.userId,
      tenantId: link.tenantId,
      isSuperAdmin: link.role === 'superadmin',
    };
  }, [authState.uid, authState.status, authState.link]);

  return <AuthContext.Provider value={{ authState, scope }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
