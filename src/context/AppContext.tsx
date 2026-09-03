import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { TabType, Tenant, User, SubscriptionPlan } from '../types';
import { loadSession, saveSession } from '../lib/session';
import { createPlanUpdateMessage, createTenantSwitchMessage, createUserSwitchMessage } from '../lib/appSession';
import { DBProvider, useDB } from './DBContext';
import { resetModuleCache } from '../hooks/useModules';

interface AppContextValue {
  isLoggedIn: boolean;
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
  handleLoginSuccess: (userId: string, tenantId?: string | null) => void;
  handleRegisterTenant: (newTenant: Tenant, newUser: User) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { db, addNotification, handleUpdateDb } = useDB();
  const initialSession = loadSession();
  const [isLoggedIn, setIsLoggedIn] = useState(initialSession.isLoggedIn);
  const [activeTenantId, setActiveTenantId] = useState(initialSession.activeTenantId);
  const [activeUserId, setActiveUserId] = useState(initialSession.activeUserId);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [saasSubTab, setSaasSubTab] = useState<string>('stats');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    saveSession({ isLoggedIn, activeTenantId, activeUserId });
  }, [isLoggedIn, activeTenantId, activeUserId]);

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const activeUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);

  // Règle stricte d'isolation : un utilisateur standard est strictement lié à son entreprise unique
  useEffect(() => {
    if (activeUser && activeUser.role !== 'superadmin' && activeUser.tenantId) {
      if (activeTenantId !== activeUser.tenantId) {
        setActiveTenantId(activeUser.tenantId);
      }
    }
  }, [activeUser, activeTenantId]);

  const handleSwitchTenant = useCallback((tenantId: string) => {
    const currentUser = db.users.find(u => u.id === activeUserId);
    if (currentUser?.role !== 'superadmin') {
      addNotification("Accès refusé : votre compte est strictement lié à une seule entreprise.", 'error');
      return;
    }
    setActiveTenantId(tenantId);
    const tenantName = db.tenants.find(t => t.id === tenantId)?.name || 'Tenant';
    addNotification(createTenantSwitchMessage(tenantName));
  }, [db, activeUserId, addNotification]);

  const handleSwitchUser = useCallback((userId: string) => {
    setActiveUserId(userId);
    const user = db.users.find(u => u.id === userId);
    if (user) {
      // Si l'utilisateur basculé n'est pas superadmin, le rattacher directement à son entreprise
      if (user.role !== 'superadmin' && user.tenantId) {
        setActiveTenantId(user.tenantId);
      }
      addNotification(createUserSwitchMessage(user.name, user.role));
    }
  }, [db, addNotification]);

  const handleUpdateTenantPlan = useCallback((tenantId: string, plan: SubscriptionPlan) => {
    const updatedTenants = db.tenants.map(t => t.id === tenantId ? { ...t, plan } : t);
    handleUpdateDb({ ...db, tenants: updatedTenants });
    addNotification(createPlanUpdateMessage(plan));
  }, [db, handleUpdateDb, addNotification]);

  const handleLoginSuccess = useCallback((userId: string, tenantId?: string | null) => {
    resetModuleCache();
    setActiveUserId(userId);
    const user = db.users.find(u => u.id === userId);
    // Un utilisateur non-superadmin est verrouillé sur son entreprise dédiée
    const boundTenantId = (user && user.role !== 'superadmin' && user.tenantId)
      ? user.tenantId
      : (tenantId || user?.tenantId || db.tenants[0]?.id || '');
    setActiveTenantId(boundTenantId);
    setIsLoggedIn(true);
    addNotification('Connexion réussie');
  }, [db.users, db.tenants, addNotification]);

  const handleRegisterTenant = useCallback((newTenant: Tenant, newUser: User) => {
    setActiveTenantId(newTenant.id);
    setActiveUserId(newUser.id);
    addNotification(`Création réussie de ${newTenant.name}`);
  }, [addNotification]);

  return (
    <AppContext.Provider value={{
      isLoggedIn, setIsLoggedIn, activeTenantId, setActiveTenantId,
      activeUserId, setActiveUserId, currentTab, setCurrentTab,
      saasSubTab, setSaasSubTab, sidebarOpen, setSidebarOpen,
      activeTenant, activeUser, handleSwitchTenant, handleSwitchUser,
      handleUpdateTenantPlan, handleLoginSuccess, handleRegisterTenant
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
