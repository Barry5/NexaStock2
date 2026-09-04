import { useState, useEffect, useMemo, useCallback, Suspense, lazy, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Package, ShoppingBag, Users, Coins, Sparkles,
  Settings, Cloud, CloudLightning, CloudOff, Bell, Menu, X, Lock,
  Building, AlertOctagon, AlertTriangle, CreditCard, Database, Shield,
  BarChart3, FileText, LifeBuoy, Award, Check, ShieldCheck, Truck
} from 'lucide-react';

import type { TabType, DBState, Sale, Product, Customer, Tenant, User, SubscriptionPlan, SubscriptionPayment } from './types';

import { DBProvider, useDB, AppProvider, useApp } from './context';
import { LOCAL_CACHE_KEY, DEFAULT_PRICING_PLANS, AUTH_TOKEN_KEY } from './constants';
import { formatCurrency } from './utils';
import { useAvailableModules, resetModuleCache } from './hooks/useModules';
import { Header } from './components/Layout/Header';
import UserProfileModal from './components/UserProfileModal';
import SaaSAuth from './components/SaaSAuth';
import { lazyWithRetry } from './utils/lazyWithRetry';

const LazyDashboard = lazyWithRetry(() => import('./components/Dashboard'), 'Dashboard');
const LazyProducts = lazyWithRetry(() => import('./components/Products'), 'Products');
const LazyPOS = lazyWithRetry(() => import('./components/POS'), 'POS');
const LazyCustomers = lazyWithRetry(() => import('./components/Customers'), 'Customers');
const LazyExpenses = lazyWithRetry(() => import('./components/Expenses'), 'Expenses');
const LazyAIRestock = lazyWithRetry(() => import('./components/AIRestock'), 'AIRestock');
const LazySaaSSettings = lazyWithRetry(() => import('./components/SaaSSettings'), 'SaaSSettings');
const LazySaaSAdmin = lazyWithRetry(() => import('./components/SaaSAdmin'), 'SaaSAdmin');
const LazyUserManagement = lazyWithRetry(() => import('./components/UserManagement'), 'UserManagement');
const LazyInvoicing = lazyWithRetry(() => import('./components/Invoicing'), 'Invoicing');
const LazyCommissions = lazyWithRetry(() => import('./components/Commissions'), 'Commissions');
const LazyDeliveryNotes = lazyWithRetry(() => import('./components/DeliveryNotes'), 'DeliveryNotes');
const LazyRBACManager = lazyWithRetry(() => import('./components/RBACManager'), 'RBACManager');

function AppShell() {
  const {
    db, isSyncing, syncError, isOnline, lastCacheTime, notifications,
    addNotification, handleUpdateDb, handleProductsUpdate, handleAddSale,
    handleUpdateExpenses, handleUpdateLoans, handleUpdateCustomers, handleUpdateSuppliers
  } = useDB();

  const {
    isLoggedIn, setIsLoggedIn, activeTenantId, setActiveTenantId,
    activeUserId, setActiveUserId, currentTab, setCurrentTab,
    saasSubTab, setSaasSubTab, sidebarOpen, setSidebarOpen,
    activeTenant, activeUser, handleSwitchTenant, handleSwitchUser,
    handleUpdateTenantPlan, handleLoginSuccess, handleRegisterTenant
  } = useApp();

  // Lock screen payment declaration states
  const [showLockPaymentForm, setShowLockPaymentForm] = useState(false);
  const [lockPlan, setLockPlan] = useState('Standard');
  const [lockMethod, setLockMethod] = useState('Orange Money');
  const [lockRef, setLockRef] = useState('');
  const [lockPhone, setLockPhone] = useState('');
  const [lockAmount, setLockAmount] = useState('29');
  const [lockComment, setLockComment] = useState('');
  const [lockReceiptImage, setLockReceiptImage] = useState('');

  // Passwordless Security Configuration States
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSecurePasswordModal, setShowSecurePasswordModal] = useState(false);
  const [securePassword, setSecurePassword] = useState('');
  const [securePasswordConfirm, setSecurePasswordConfirm] = useState('');
  const [securePasswordError, setSecurePasswordError] = useState('');

  // Document title
  useEffect(() => {
    if (isLoggedIn) {
      if (activeUser?.role === 'superadmin') {
        document.title = "Console SaaS Root Administrator | NexaStock";
      } else if (activeTenant?.name) {
        document.title = `${activeTenant.name} | NexaStock ERP`;
      } else {
        document.title = "NexaStock ERP & POS";
      }
    } else {
      document.title = "NexaStock SaaS Central";
    }
  }, [isLoggedIn, activeTenant, activeUser]);

  // Auto-dismiss toast notifications after 6s
  const [dismissedToasts, setDismissedToasts] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    const timer = setTimeout(() => {
      setDismissedToasts(prev => new Set(prev).add(latest.id));
    }, 6000);
    return () => clearTimeout(timer);
  }, [notifications]);

  const pricingPlans = useMemo(() => {
    if (db.pricingPlans && db.pricingPlans.length > 0) return db.pricingPlans;
    return DEFAULT_PRICING_PLANS.map(p => ({ ...p, currency: db.saasCurrency || 'EUR' }));
  }, [db.pricingPlans, db.saasCurrency]);

  const isSuspended = useMemo(() => {
    if (!activeTenant) return false;
    return activeTenant.subscriptionStatus === 'SUSPENDED' ||
           activeTenant.subscriptionStatus === 'BLOCKED' ||
           activeTenant.subscriptionStatus === 'EXPIRED' ||
           activeTenant.description?.includes('[SUSPENDU]');
  }, [activeTenant]);

  const handlePaySuspension = useCallback(() => {
    if (!activeTenantId) return;
    const updatedTenants = db.tenants.map(t => {
      if (t.id === activeTenantId) {
        return { ...t, subscriptionStatus: 'ACTIVE' as const, description: t.description.replace(' [SUSPENDU]', '') };
      }
      return t;
    });
    handleUpdateDb({ ...db, tenants: updatedTenants });
    addNotification("Abonnement régularisé provisoirement !");
  }, [activeTenantId, db, handleUpdateDb, addNotification]);

  const handleSaveSecurePassword = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (securePassword.length < 4) {
      setSecurePasswordError("Le mot de passe doit comporter au moins 4 caractères.");
      return;
    }
    if (securePassword !== securePasswordConfirm) {
      setSecurePasswordError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    const nextUsers = db.users.map(u => {
      if (u.id === activeUserId) return { ...u, password: securePassword, firstLoginReset: false };
      return u;
    });
    handleUpdateDb({ ...db, users: nextUsers });
    addNotification("Votre mot de passe a été configuré avec succès ! Votre espace est sécurisé.");
    setShowSecurePasswordModal(false);
    setSecurePassword('');
    setSecurePasswordConfirm('');
    setSecurePasswordError('');
  }, [securePassword, securePasswordConfirm, db, activeUserId, handleUpdateDb, addNotification]);

  const handleOfflinePaymentFromLock = useCallback((paymentData: SubscriptionPayment) => {
    const nextPayments = [paymentData, ...(db.subscriptionPayments || [])];
    handleUpdateDb({
      ...db,
      subscriptionPayments: nextPayments,
      tenants: db.tenants.map(t => t.id === activeTenantId ? { ...t, subscriptionStatus: 'PENDING' as const } : t)
    });
    addNotification("Reçu de paiement transmis à l'administrateur ! Analyse en cours.");
  }, [db, activeTenantId, handleUpdateDb, addNotification]);

  const { availableModules } = useAvailableModules();

  const sidebarMenuItems = useMemo(() => {
    const allItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, section: 'GÉNÉRAL', module: 'dashboard' },
      { id: 'invoicing', label: 'Factures ERP', icon: FileText, section: 'GÉNÉRAL', module: 'invoices' },
      { id: 'delivery-notes', label: 'Bons de Livraison', icon: Truck, section: 'GÉNÉRAL', module: 'invoices' },
      { id: 'commissions', label: 'Commissions', icon: Award, section: 'GÉNÉRAL', module: 'commissions' },
      { id: 'products', label: 'Produits & Stocks', icon: Package, section: 'COMMERCE', module: 'products' },
      { id: 'pos', label: 'Caisse de Vente (POS)', icon: ShoppingBag, section: 'COMMERCE', module: 'sales' },
      { id: 'crm', label: 'Clients & Grossistes', icon: Users, section: 'COMMERCE', module: 'customers' },
      { id: 'expenses', label: 'Dépenses & Prêts', icon: Coins, section: 'FINANCE', module: 'expenses' },
      { id: 'ai', label: 'Assistant IA Réappro', icon: Sparkles, section: 'INTELLIGENCE', badge: 'Gemini', module: 'ai' },
      { id: 'users', label: "Gestion de l'Équipe", icon: Shield, section: 'SÉCURITÉ', module: 'users' },
      { id: 'rbac', label: 'Permissions & Rôles', icon: ShieldCheck, section: 'SÉCURITÉ', module: 'users' },
      { id: 'settings', label: 'Paramètres & Forfaits', icon: Settings, section: 'GÉNÉRAL', module: 'settings' }
    ];

    if (!activeUser) return [];

    const roleMap: Record<string, string[]> = {
      vendeur: ['dashboard', 'pos', 'invoicing', 'settings'],
      comptable: ['dashboard', 'invoicing', 'commissions', 'expenses', 'settings'],
      'gestionnaire de stock': ['dashboard', 'products', 'ai', 'settings'],
      superadmin: ['saasadmin', 'settings'],
    };

    let allowedIds = roleMap[activeUser.role] || ['dashboard', 'invoicing', 'commissions', 'products', 'pos', 'crm', 'expenses', 'ai', 'users', 'rbac', 'settings', 'delivery-notes'];
    
    let filtered = allItems.filter(item => {
      if (!allowedIds.includes(item.id)) return false;
      if (activeUser.role === 'superadmin') return true;
      if (availableModules.length > 0 && !availableModules.includes(item.module)) return false;
      return true;
    });

    if (activeUser.role === 'superadmin') {
      filtered = [
        { id: 'saasadmin', label: 'Console Super Admin', icon: Lock, section: 'SaaS', badge: 'Admin', module: '' },
        { id: 'settings', label: 'Paramètres Généraux', icon: Settings, section: 'GÉNÉRAL', module: 'settings' }
      ];
    }

    return filtered;
  }, [activeUser, availableModules]);

  useEffect(() => {
    if (isLoggedIn && sidebarMenuItems.length > 0) {
      const isAllowed = sidebarMenuItems.some(item => item.id === currentTab);
      if (!isAllowed) setCurrentTab(sidebarMenuItems[0].id as TabType);
    }
  }, [sidebarMenuItems, currentTab, isLoggedIn, setCurrentTab]);

  if (!isLoggedIn) {
    return <SaaSAuth />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex antialiased selection:bg-blue-600/30 selection:text-white">
      
      {/* MOBILE HEADER BAR */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold tracking-wider text-blue-400 uppercase">
            {activeTenant?.name || "NexaStock"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-950 px-2 py-1 rounded-lg border border-gray-800 text-[10px] font-mono">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <Cloud className="w-3 h-3 text-gray-400" />
          </div>
          {activeUser && (
            <button
              onClick={() => setShowProfileModal(true)}
              className={`w-8 h-8 rounded-xl bg-gradient-to-br ${activeUser.avatar || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-xs font-bold text-white shadow-sm border border-white/10`}
              title="Mon Profil"
            >
              {(activeUser.name.slice(0, 2) || 'NX').toUpperCase()}
            </button>
          )}
        </div>
      </div>

      {/* DESKTOP & MOBILE SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col justify-between transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 px-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                N
              </div>
              <div>
                <span className="font-extrabold tracking-wider text-sm font-display text-white block">NexaStock ERP</span>
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Multi-Tenant Cloud</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 hover:bg-gray-800 rounded-lg text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {sidebarMenuItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id as TabType);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* User profile card & status footer */}
          <div className="p-3 border-t border-gray-800 bg-gray-950/70 flex-shrink-0 space-y-2.5">
            {activeUser && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-gray-900 hover:bg-gray-850 border border-gray-800 hover:border-gray-700 transition text-left group"
                title="Modifier mon profil"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activeUser.avatar || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-xs font-black text-white shadow-sm flex-shrink-0`}>
                  {(activeUser.name.slice(0, 2) || 'NX').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate group-hover:text-blue-400 transition">{activeUser.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono truncate uppercase">{activeUser.role}</p>
                </div>
              </button>
            )}

            <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
              <span 
                className="flex items-center gap-1.5"
                title={isOnline ? (activeUser?.role === 'superadmin' ? 'Connecté à Firebase Cloud' : 'Système connecté et synchronisé') : 'Mode hors-ligne local'}
              >
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {isOnline ? (activeUser?.role === 'superadmin' ? 'Firebase Cloud' : 'En Ligne') : 'Hors Ligne'}
              </span>
            </div>

            <button
              onClick={() => {
                resetModuleCache();
                setIsLoggedIn(false);
                setActiveUserId('');
                setActiveTenantId('');
                localStorage.removeItem('nexastock_session');
                localStorage.removeItem('nexastock_token');
              }}
              className="w-full py-1.5 bg-gray-900 hover:bg-red-500/10 border border-gray-800 hover:border-red-500/30 text-gray-400 hover:text-red-400 text-xs rounded-xl transition font-mono"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="content-area flex-1 flex flex-col min-w-0 relative lg:pt-0 pt-14">
        <Header />

        {/* First Login Security Alert */}
        {activeUser?.firstLoginReset && (
          <div className="bg-amber-600/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 animate-pulse" />
              <span>
                <strong>Sécurité :</strong> Votre compte requiert la configuration d'un mot de passe personnalisé pour protéger l'organisation <strong>{activeTenant?.name}</strong>.
              </span>
            </div>
            <button
              onClick={() => setShowSecurePasswordModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-3 py-1 rounded-lg transition text-[10.5px] font-mono shadow-md"
            >
              Définir mon mot de passe
            </button>
          </div>
        )}

        <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-24 lg:pb-8 overflow-y-auto relative w-full max-w-full">
          <AnimatePresence mode="wait">
            {isSuspended ? (
              <motion.div
                key="suspended-shield"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gray-950/98 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 overflow-y-auto"
              >
                <div className="max-w-xl w-full bg-gray-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl space-y-6">
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-400 mx-auto animate-pulse">
                      <AlertOctagon className="w-7 h-7" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-black text-white font-display uppercase tracking-wide">Espace de Travail Suspendu</h3>
                      <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                        Votre organisation <strong className="text-white">{activeTenant?.name}</strong> est inactive ou suspendue car votre abonnement <strong className="text-blue-400">{activeTenant?.plan}</strong> est échu.
                      </p>
                    </div>
                  </div>

                  {activeTenant?.subscriptionStatus === 'PENDING' ? (
                    <div className="bg-blue-500/5 border border-blue-500/20 p-5 rounded-2xl text-center space-y-3">
                      <p className="text-xs text-blue-400 font-bold uppercase font-mono tracking-wider animate-pulse">⌛ Vérification comptable en cours</p>
                      <p className="text-[11px] text-gray-400 leading-normal">Un reçu de paiement a été transmis. L'administrateur valide votre transaction.</p>
                    </div>
                  ) : !showLockPaymentForm ? (
                    <div className="space-y-4">
                      <div className="bg-gray-950 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between text-left">
                        <div>
                          <p className="text-[10px] font-mono text-gray-500 uppercase">Forfait de Référence</p>
                          <p className="text-xs font-bold text-white">Plan {activeTenant?.plan}</p>
                        </div>
                        <span className="text-sm font-black font-mono text-red-400">
                          {(() => {
                            const planObj = pricingPlans.find(p => p.name === (activeTenant?.plan || 'Standard'));
                            const price = planObj?.price || 29;
                            const currency = planObj?.currency || db.saasCurrency || 'EUR';
                            return `${price} ${currency} / mois`;
                          })()}
                        </span>
                      </div>

                      <div className="space-y-2 pt-2">
                        <button
                          onClick={() => setShowLockPaymentForm(true)}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20"
                        >
                          <CreditCard className="w-4 h-4" /> Déclarer un versement effectué
                        </button>
                        <button
                          onClick={handlePaySuspension}
                          className="w-full bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 hover:text-white text-[10.5px] font-mono font-bold py-1.5 rounded-xl transition"
                        >
                          Bypass Démo (Activer Provisoirement)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!lockRef || !lockPhone) { alert("Veuillez saisir les références du transfert."); return; }
                        const paymentObj: SubscriptionPayment = {
                          id: `pay-${Date.now()}`, tenantId: activeTenantId,
                          tenantName: activeTenant?.name || "Boutique",
                          planId: `plan-${lockPlan.toLowerCase()}`, planName: lockPlan,
                          amount: Number(lockAmount), currency: activeTenant?.currency || 'EUR',
                          paymentMethod: lockMethod, reference: lockRef,
                          transactionNumber: lockPhone, date: new Date().toISOString().split('T')[0],
                          comment: lockComment,
                          receiptImage: lockReceiptImage || "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80",
                          status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                        };
                        handleOfflinePaymentFromLock(paymentObj);
                        setShowLockPaymentForm(false);
                      }}
                      className="text-left space-y-3 bg-gray-950 border border-gray-850 p-5 rounded-2xl"
                    >
                      <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">Déclarer mon paiement</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">FORFAIT</label>
                          <select
                            value={lockPlan}
                            onChange={(e) => {
                              setLockPlan(e.target.value);
                              const p = pricingPlans.find(pr => pr.name === e.target.value);
                              setLockAmount(p ? String(p.price) : '29');
                            }}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white"
                          >
                            {pricingPlans.map(p => <option key={p.id} value={p.name}>{p.name} ({p.price} {p.currency})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">MÉTHODE</label>
                          <select value={lockMethod} onChange={(e) => setLockMethod(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white">
                            <option value="Orange Money">Orange Money</option>
                            <option value="Mobile Money (MTN)">MTN Mobile Money</option>
                            <option value="Wave">Wave</option>
                            <option value="Virement Bancaire">Virement Bancaire</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">RÉFÉRENCE TRANSACTION *</label>
                          <input type="text" required placeholder="ex: TXN-12345678" value={lockRef} onChange={(e) => setLockRef(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">N° DE TÉLÉPHONE *</label>
                          <input type="text" required placeholder="ex: +224 620..." value={lockPhone} onChange={(e) => setLockPhone(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white font-mono" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 text-xs justify-end">
                        <button type="button" onClick={() => setShowLockPaymentForm(false)}
                          className="bg-gray-900 border border-gray-800 text-gray-400 font-bold px-3 py-1.5 rounded-lg hover:text-white">Annuler</button>
                        <button type="submit"
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-lg shadow-lg shadow-blue-500/20">Envoyer</button>
                      </div>
                    </form>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
              >
                {currentTab === 'dashboard' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement du tableau de bord...</div>}>
                    <LazyDashboard />
                  </Suspense>
                )}
                {currentTab === 'products' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement du catalogue...</div>}>
                    <LazyProducts />
                  </Suspense>
                )}
                {currentTab === 'pos' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la caisse POS...</div>}>
                    <LazyPOS />
                  </Suspense>
                )}
                {currentTab === 'crm' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des clients...</div>}>
                    <LazyCustomers />
                  </Suspense>
                )}
                {currentTab === 'expenses' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des finances...</div>}>
                    <LazyExpenses />
                  </Suspense>
                )}
                {currentTab === 'invoicing' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la facturation...</div>}>
                    <LazyInvoicing />
                  </Suspense>
                )}
                {currentTab === 'commissions' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des commissions...</div>}>
                    <LazyCommissions />
                  </Suspense>
                )}
                {currentTab === 'delivery-notes' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des BL...</div>}>
                    <LazyDeliveryNotes />
                  </Suspense>
                )}
                {currentTab === 'ai' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de l'assistant IA...</div>}>
                    <LazyAIRestock />
                  </Suspense>
                )}
                {currentTab === 'settings' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des paramètres...</div>}>
                    <LazySaaSSettings />
                  </Suspense>
                )}
                {currentTab === 'users' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des collaborateurs...</div>}>
                    <LazyUserManagement />
                  </Suspense>
                )}
                {currentTab === 'rbac' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des permissions...</div>}>
                    <LazyRBACManager />
                  </Suspense>
                )}
                {currentTab === 'saasadmin' && activeUser?.role === 'superadmin' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la console super admin...</div>}>
                    <LazySaaSAdmin />
                  </Suspense>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-gray-900 border-t border-gray-800 flex items-center justify-around px-1 z-40">
        {[
          { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
          { id: 'pos', label: 'Caisse', icon: ShoppingBag },
          { id: 'invoicing', label: 'Factures', icon: FileText },
          { id: 'products', label: 'Stocks', icon: Package },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as TabType)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
                isActive ? 'text-blue-500 font-bold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-1">{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setSidebarOpen(true)}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-gray-400 hover:text-gray-200"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-1">Menu</span>
        </button>
      </div>

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-[999] space-y-2 pointer-events-none">
        <AnimatePresence>
          {notifications.filter(n => !dismissedToasts.has(n.id)).slice(0, 3).map((not, i) => (
            <motion.div
              key={not.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
              className={`pointer-events-auto max-w-sm p-3.5 rounded-xl border shadow-xl backdrop-blur-md ${
                not.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' :
                not.type === 'warning' ? 'bg-amber-950/90 border-amber-800 text-amber-200' :
                not.type === 'success' ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200' :
                'bg-gray-900/95 border-gray-800 text-gray-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{not.text}</p>
                  <p className="text-[9px] opacity-60 mt-0.5 font-mono">{not.time}</p>
                </div>
                <button
                  onClick={() => setDismissedToasts(prev => new Set(prev).add(not.id))}
                  className="opacity-50 hover:opacity-100 transition p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* SECURE PASSWORD MODAL */}
      <AnimatePresence>
        {showSecurePasswordModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setShowSecurePasswordModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Sécurisation du Compte</h3>
                  <p className="text-[10px] text-gray-500 font-mono">NexaStock Cloud Multi-Tenant</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4 leading-normal font-sans">
                Puisque vous avez créé votre organisation sans mot de passe, configurez un mot de passe d'accès pour sécuriser vos données.
              </p>
              {securePasswordError && (
                <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl text-red-400 text-xs font-bold font-mono mb-4">
                  {securePasswordError}
                </div>
              )}
              <form onSubmit={handleSaveSecurePassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Nouveau Mot de Passe</label>
                  <input
                    type="password"
                    required
                    value={securePassword}
                    onChange={(e) => { setSecurePassword(e.target.value); setSecurePasswordError(''); }}
                    placeholder="Saisissez au moins 4 caractères"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Confirmer le Mot de Passe</label>
                  <input
                    type="password"
                    required
                    value={securePasswordConfirm}
                    onChange={(e) => { setSecurePasswordConfirm(e.target.value); setSecurePasswordError(''); }}
                    placeholder="Confirmez votre mot de passe"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 transition text-gray-950 text-xs font-bold py-2.5 rounded-xl shadow-lg font-mono flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Enregistrer mon mot de passe
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* USER PROFILE & SECURITY MODAL */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <DBProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </DBProvider>
  );
}
