import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { TabType, Tenant, User, SubscriptionPlan } from '../types';
import { createPlanUpdateMessage, createTenantSwitchMessage, createUserSwitchMessage } from '../lib/appSession';
import { DBProvider, useDB } from './DBContext';
import { AuthProvider, useAuth } from './AuthContext';
import { resetModuleCache } from '../hooks/useModules';
import { signOutUser } from '../lib/authService';

const TENANT_SELECTION_KEY = 'nexastock_selected_tenant';

interface AppContextValue {
  isLoggedIn: boolean;
  /** @deprecated la session est pilotée par Firebase Auth ; utiliser `logout()`. */
  setIsLoggedIn: (v: boolean) => void;
  activeTenantId: string;
  setActiveTenantId: (v: string) => void;
  activeUserId: string;
  setActiveUserId: (v: string) => void;
  currentTab: TabType;
  setCurrentTab: (v: TabType) => void;
  saasSubTab: string;
  setSaasSubTab: (v: any) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  activeTenant: Tenant | undefined;
  activeUser: User | undefined;
  handleSwitchTenant: (tenantId: string) => void;
  handleSwitchUser: (userId: string) => void;
  handleUpdateTenantPlan: (tenantId: string, plan: SubscriptionPlan) => void;
  handleLoginSuccess: (userId: string, tenantId?: string | null, _db?: unknown) => void;
  handleRegisterTenant: (newTenant: Tenant, newUser: User) => void;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function readSelectedTenant(): string {
  try { return localStorage.getItem(TENANT_SELECTION_KEY) || ''; } catch { return ''; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { authState } = useAuth();
  const { db, addNotification, handleUpdateDb, clearLocalData, getUnsyncedOperationsCount, handleSyncFromServer } = useDB();

  // SEC-02 : la session n'est plus lue depuis localStorage ; elle découle du compte Firebase Auth.
  const link = authState.link;
  const isLoggedIn = Boolean(link) && (authState.status === 'signedIn' || authState.status === 'loading');
  const activeUserId = link?.userId || '';

  const [selectedTenantId, setSelectedTenantId] = useState<string>(readSelectedTenant);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [saasSubTab, setSaasSubTab] = useState<string>('stats');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Utilisateur de boutique : toujours sa boutique. Super admin : sélection mémorisée.
  const activeTenantId = link && link.role !== 'superadmin' && link.tenantId ? link.tenantId : selectedTenantId;

  const setActiveTenantId = useCallback((v: string) => {
    setSelectedTenantId(v);
    try { localStorage.setItem(TENANT_SELECTION_KEY, v); } catch { /* ignore */ }
  }, []);

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const activeUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);

  // Super admin : résolution automatique d'une boutique valide.
  useEffect(() => {
    if (!link || link.role !== 'superadmin') return;
    if (db.tenants.length === 0) return;
    if (!activeTenantId || !db.tenants.some(t => t.id === activeTenantId)) {
      const tenantWithProducts = db.tenants.find(t => db.products.some(p => p.tenantId === t.id));
      setActiveTenantId((tenantWithProducts || db.tenants[0]).id);
    }
  }, [link, db.tenants, db.products, activeTenantId, setActiveTenantId]);

  const handleSwitchTenant = useCallback((tenantId: string) => {
    if (link?.role !== 'superadmin') {
      addNotification("Accès refusé : votre compte est strictement lié à une seule entreprise.", 'error');
      return;
    }
    setActiveTenantId(tenantId);
    const tenantName = db.tenants.find(t => t.id === tenantId)?.name || 'Tenant';
    addNotification(createTenantSwitchMessage(tenantName));
  }, [db.tenants, link, addNotification, setActiveTenantId]);

  /**
   * L'ancien « changement d'utilisateur » sans mot de passe est supprimé (SEC-02) :
   * changer d'utilisateur impose une déconnexion puis une connexion.
   */
  const handleSwitchUser = useCallback((userId: string) => {
    const user = db.users.find(u => u.id === userId);
    if (user && userId !== activeUserId) {
      addNotification(`Pour utiliser le compte ${user.name}, déconnectez-vous puis connectez-vous avec ses identifiants.`, 'warning');
    } else if (user) {
      addNotification(createUserSwitchMessage(user.name, user.role));
    }
  }, [db.users, activeUserId, addNotification]);

  const handleUpdateTenantPlan = useCallback((tenantId: string, plan: SubscriptionPlan) => {
    const updatedTenants = db.tenants.map(t => t.id === tenantId ? { ...t, plan } : t);
    void handleUpdateDb({ ...db, tenants: updatedTenants });
    addNotification(createPlanUpdateMessage(plan));
  }, [db, handleUpdateDb, addNotification]);

  const handleLoginSuccess = useCallback((_userId: string, tenantId?: string | null) => {
    resetModuleCache();
    if (tenantId) setActiveTenantId(tenantId);
    addNotification('Connexion réussie');
  }, [addNotification, setActiveTenantId]);

  const handleRegisterTenant = useCallback((newTenant: Tenant, newUser: User) => {
    setActiveTenantId(newTenant.id);
    addNotification(`Création réussie de ${newTenant.name} (${newUser.name})`);
  }, [addNotification, setActiveTenantId]);

  /** Déconnexion : tente d'envoyer la file locale, avertit s'il reste des opérations, purge le cache (SEC-06). */
  const logout = useCallback(async () => {
    try {
      await handleSyncFromServer();
      const remaining = await getUnsyncedOperationsCount();
      if (remaining > 0) {
        const ok = window.confirm(
          `${remaining} opération(s) ne sont pas encore confirmées par le serveur. Elles restent enregistrées sur ce poste et seront envoyées à votre prochaine connexion. Se déconnecter quand même ?`,
        );
        if (!ok) return;
      }
    } catch { /* déconnexion possible même hors ligne */ }
    await clearLocalData();
    resetModuleCache();
    try { localStorage.removeItem('nexastock_session'); localStorage.removeItem('nexastock_token'); } catch { /* ignore */ }
    await signOutUser();
    setCurrentTab('dashboard');
  }, [handleSyncFromServer, getUnsyncedOperationsCount, clearLocalData]);

  const setIsLoggedIn = useCallback((v: boolean) => {
    if (!v) void logout();
  }, [logout]);

  const setActiveUserId = useCallback((_v: string) => {
    // Sans effet : l'utilisateur actif est celui du compte Firebase Auth connecté.
  }, []);

  return (
    <AppContext.Provider value={{
      isLoggedIn, setIsLoggedIn, activeTenantId, setActiveTenantId,
      activeUserId, setActiveUserId, currentTab, setCurrentTab,
      saasSubTab, setSaasSubTab, sidebarOpen, setSidebarOpen,
      activeTenant, activeUser, handleSwitchTenant, handleSwitchUser,
      handleUpdateTenantPlan, handleLoginSuccess, handleRegisterTenant, logout,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { DBProvider, useDB } from './DBContext';
export { AuthProvider, useAuth } from './AuthContext';
