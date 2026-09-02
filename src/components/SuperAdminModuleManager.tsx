import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Save,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Package,
  ShoppingBag,
  FileText,
  Truck,
  Users,
  Coins,
  Award,
  Building,
  Settings,
  LayoutDashboard,
  Search,
  CheckCircle2,
  RefreshCw,
  Building2,
  Lock,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  Zap,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { DEFAULT_MODULE_DEFINITIONS, getDefaultModulesForPlan } from '../constants';
import type { ModuleDefinition, PlanModule, TenantModule, PricingPlan, Tenant } from '../types';

interface SuperAdminModuleManagerProps {
  initialPlanId?: string;
  onNavigateToPlans?: () => void;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  LayoutDashboard,
  Package,
  ShoppingBag,
  FileText,
  Truck,
  Users,
  Coins,
  Sparkles,
  Award,
  Building,
  ShieldCheck,
  Settings,
};

const CATEGORIES = [
  'Tous',
  'Commerce',
  'Finances',
  'Logistique',
  'Intelligence',
  'Sécurité',
  'Général'
] as const;

export default function SuperAdminModuleManager({
  initialPlanId,
  onNavigateToPlans
}: SuperAdminModuleManagerProps) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeUser } = useApp();

  // Tab mode: 'plans' (plan configuration) or 'tenants' (tenant-specific overrides)
  const [activeViewMode, setActiveViewMode] = useState<'plans' | 'tenants'>('plans');

  // Search and category filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');

  // Selected Plan
  const plans = useMemo(() => {
    if (db.pricingPlans && db.pricingPlans.length > 0) return db.pricingPlans;
    return [
      { id: 'plan-free', name: 'Starter / Essai', price: 0, currency: db.saasCurrency || 'EUR', durationDays: 14, color: 'gray', active: true },
      { id: 'plan-standard', name: 'Standard / Business', price: 29, currency: db.saasCurrency || 'EUR', durationDays: 30, color: 'blue', active: true },
      { id: 'plan-premium', name: 'Pro / Entreprise & IA', price: 79, currency: db.saasCurrency || 'EUR', durationDays: 30, color: 'purple', active: true },
      { id: 'plan-enterprise-annual', name: 'Illimité Annuel VIP', price: 699, currency: db.saasCurrency || 'EUR', durationDays: 365, color: 'amber', active: true }
    ] as PricingPlan[];
  }, [db.pricingPlans, db.saasCurrency]);

  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    if (initialPlanId && plans.some(p => p.id === initialPlanId)) return initialPlanId;
    return plans[0]?.id || 'plan-standard';
  });

  // Selected Tenant for override view
  const tenants = useMemo(() => db.tenants || [], [db.tenants]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => tenants[0]?.id || '');

  // Master module definitions
  const moduleDefinitions = useMemo(() => {
    if (db.moduleDefinitions && db.moduleDefinitions.length > 0) {
      return db.moduleDefinitions;
    }
    return DEFAULT_MODULE_DEFINITIONS as ModuleDefinition[];
  }, [db.moduleDefinitions]);

  // Local state for Plan Modules: map planId -> Set of enabled moduleKeys
  const [localPlanModules, setLocalPlanModules] = useState<Record<string, string[]>>({});
  
  // Local state for Tenant Modules: map tenantId -> Record<moduleKey, boolean>
  const [localTenantModules, setLocalTenantModules] = useState<Record<string, Record<string, boolean>>>({});

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local plan modules from DB
  React.useEffect(() => {
    const planMap: Record<string, string[]> = {};
    const existingPlanModules = db.planModules || [];

    for (const plan of plans) {
      const records = existingPlanModules.filter(pm => pm.planId === plan.id || pm.planId === plan.name);
      if (records.length > 0) {
        planMap[plan.id] = records.filter(r => r.enabled !== false).map(r => r.moduleKey);
      } else {
        planMap[plan.id] = getDefaultModulesForPlan(plan.id || plan.name);
      }
    }
    setLocalPlanModules(planMap);

    // Initialize tenant overrides
    const tenantMap: Record<string, Record<string, boolean>> = {};
    for (const tm of (db.tenantModules || [])) {
      if (!tenantMap[tm.tenantId]) tenantMap[tm.tenantId] = {};
      tenantMap[tm.tenantId][tm.moduleKey] = tm.enabled;
    }
    setLocalTenantModules(tenantMap);
  }, [db.planModules, db.tenantModules, plans]);

  // Current active plan
  const currentPlan = useMemo(() => {
    return plans.find(p => p.id === selectedPlanId) || plans[0];
  }, [plans, selectedPlanId]);

  // Current enabled modules for the selected plan
  const enabledModuleKeysForPlan = useMemo(() => {
    return localPlanModules[selectedPlanId] || getDefaultModulesForPlan(selectedPlanId);
  }, [localPlanModules, selectedPlanId]);

  // Current selected tenant
  const currentTenant = useMemo(() => {
    return tenants.find(t => t.id === selectedTenantId) || tenants[0];
  }, [tenants, selectedTenantId]);

  // Count tenants on each plan
  const tenantCountPerPlan = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tenants) {
      const planKey = t.subscriptionPlanId || t.plan || 'Standard';
      const matched = plans.find(p => p.id === planKey || p.name.toLowerCase() === planKey.toLowerCase());
      const key = matched ? matched.id : planKey;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [tenants, plans]);

  // Toggle module on plan
  const handleTogglePlanModule = (moduleKey: string) => {
    const isCore = moduleDefinitions.find(d => d.key === moduleKey)?.is_core;
    if (isCore) return; // Core modules cannot be disabled

    const currentKeys = localPlanModules[selectedPlanId] || getDefaultModulesForPlan(selectedPlanId);
    const updated = currentKeys.includes(moduleKey)
      ? currentKeys.filter(k => k !== moduleKey)
      : [...currentKeys, moduleKey];

    setLocalPlanModules(prev => ({
      ...prev,
      [selectedPlanId]: updated
    }));
    setIsSaved(false);
  };

  // Preset: Activate all
  const handlePresetActivateAll = () => {
    const allKeys = moduleDefinitions.map(d => d.key);
    setLocalPlanModules(prev => ({
      ...prev,
      [selectedPlanId]: allKeys
    }));
    setIsSaved(false);
    addNotification(`Tous les modules activés pour le forfait ${currentPlan?.name}.`);
  };

  // Preset: Essential POS & Stock
  const handlePresetEssentialPOS = () => {
    const essentialKeys = ['dashboard', 'products', 'sales', 'customers', 'settings'];
    setLocalPlanModules(prev => ({
      ...prev,
      [selectedPlanId]: essentialKeys
    }));
    setIsSaved(false);
    addNotification(`Formule Caisse & Stocks Essentiels appliquée pour ${currentPlan?.name}.`);
  };

  // Preset: Reset to standard plan tier defaults
  const handlePresetResetDefaults = () => {
    const defaultKeys = getDefaultModulesForPlan(selectedPlanId || currentPlan?.name);
    setLocalPlanModules(prev => ({
      ...prev,
      [selectedPlanId]: defaultKeys
    }));
    setIsSaved(false);
    addNotification(`Modules réinitialisés selon le profil recommandé pour ${currentPlan?.name}.`);
  };

  // Toggle tenant override
  const handleToggleTenantOverride = (moduleKey: string, overrideState: 'inherit' | 'enabled' | 'disabled') => {
    const currentTenantOverrides = { ...(localTenantModules[selectedTenantId] || {}) };

    if (overrideState === 'inherit') {
      delete currentTenantOverrides[moduleKey];
    } else if (overrideState === 'enabled') {
      currentTenantOverrides[moduleKey] = true;
    } else if (overrideState === 'disabled') {
      currentTenantOverrides[moduleKey] = false;
    }

    setLocalTenantModules(prev => ({
      ...prev,
      [selectedTenantId]: currentTenantOverrides
    }));
    setIsSaved(false);
  };

  // Save changes to DB and trigger sync to Firebase
  const handleSaveAllChanges = useCallback(async () => {
    setIsSaving(true);
    try {
      // 1. Build next planModules array
      const nextPlanModules: PlanModule[] = [];
      for (const [planId, moduleKeys] of Object.entries(localPlanModules)) {
        for (const def of moduleDefinitions) {
          const isEnabled = def.is_core || moduleKeys.includes(def.key);
          nextPlanModules.push({
            id: `pm-${planId}-${def.key}`,
            planId,
            moduleKey: def.key,
            enabled: isEnabled
          });
        }
      }

      // 2. Build next tenantModules array
      const nextTenantModules: TenantModule[] = [];
      for (const [tenantId, overrides] of Object.entries(localTenantModules)) {
        for (const [moduleKey, enabled] of Object.entries(overrides)) {
          nextTenantModules.push({
            id: `tm-${tenantId}-${moduleKey}`,
            tenantId,
            moduleKey,
            enabled
          });
        }
      }

      // 3. Update DB
      const nextDb = {
        ...db,
        moduleDefinitions: moduleDefinitions,
        planModules: nextPlanModules,
        tenantModules: nextTenantModules
      };

      handleUpdateDb(nextDb);
      setIsSaved(true);
      addNotification('Configuration des modules enregistrée et synchronisée avec succès !', 'success');
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      console.error('Error saving modules:', err);
      addNotification('Erreur lors de la sauvegarde des modules.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [db, localPlanModules, localTenantModules, moduleDefinitions, handleUpdateDb, addNotification]);

  // Filtered module list based on search and category
  const filteredModules = useMemo(() => {
    return moduleDefinitions.filter(def => {
      const matchSearch =
        def.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        def.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        def.key.toLowerCase().includes(searchQuery.toLowerCase());

      const rawDef = DEFAULT_MODULE_DEFINITIONS.find(d => d.key === def.key);
      const category = rawDef?.category || 'Commerce';
      const matchCategory = selectedCategory === 'Tous' || category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [moduleDefinitions, searchQuery, selectedCategory]);

  const enabledCount = enabledModuleKeysForPlan.length;
  const totalCount = moduleDefinitions.length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-gray-850 border border-gray-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/25 text-blue-400 flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                Matrice d'Accès SaaS
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                Synchronisation Firestore Active
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white font-sans tracking-tight">
              Configuration des Modules par Plan & Forfait
            </h2>
            <p className="text-xs md:text-sm text-gray-400 mt-1 max-w-3xl leading-relaxed">
              Contrôlez la visibilité des fonctionnalités métier pour chaque formule d'abonnement. Les modules désactivés sont automatiquement masqués dans l'interface et la barre de navigation de vos clients.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onNavigateToPlans && (
              <button
                type="button"
                onClick={onNavigateToPlans}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white text-xs font-bold rounded-xl border border-gray-700 transition flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Tarifs des Forfaits
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={isSaving}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg ${
                isSaved
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Synchronisation...
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Modifications Enregistrées !
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer & Appliquer
                </>
              )}
            </button>
          </div>
        </div>

        {/* View Mode Switcher (Plan Matrix vs Tenant Specific Overrides) */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-gray-800/80">
          <button
            type="button"
            onClick={() => setActiveViewMode('plans')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeViewMode === 'plans'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Configuration par Forfait ({plans.length} Forfaits)
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('tenants')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeViewMode === 'tenants'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Dérogations par Entreprise ({tenants.length} Entreprises)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: PLAN CONFIGURATION MATRIX                                         */}
      {/* ========================================================================= */}
      {activeViewMode === 'plans' && (
        <div className="space-y-6">
          {/* Plan Selector Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">
                1. Choisissez la Formule à Configurer :
              </label>
              <span className="text-[11px] font-mono text-gray-500">
                {enabledCount} sur {totalCount} modules activés
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {plans.map(plan => {
                const isSelected = selectedPlanId === plan.id;
                const subscriberCount = tenantCountPerPlan[plan.id] || tenantCountPerPlan[plan.name] || 0;
                const modulesForThisPlan = localPlanModules[plan.id] || getDefaultModulesForPlan(plan.id);

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`p-4 rounded-2xl border text-left transition relative overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gray-850 border-blue-500/80 ring-2 ring-blue-500/20 shadow-xl'
                        : 'bg-gray-900/90 border-gray-800 hover:border-gray-700 hover:bg-gray-850/60'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-2 h-full bg-blue-500" />
                    )}

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-bold text-white font-sans truncate">
                          {plan.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {formatCurrency(plan.price ?? 0, plan.currency || db.saasCurrency || 'EUR', 0)}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-400 line-clamp-1 mb-3">
                        {plan.description || 'Formule d\'abonnement NexaStock'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-[10px] text-gray-500 font-mono">
                      <span>
                        <strong className="text-gray-300">{modulesForThisPlan.length}</strong> / {totalCount} modules
                      </span>
                      <span className="flex items-center gap-1 text-gray-400">
                        <Users className="w-3 h-3" />
                        {subscriberCount} {subscriberCount > 1 ? 'abonnés' : 'abonné'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Presets & Plan Control Banner */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white font-mono uppercase">
                  Profil d'accès pour : <span className="text-blue-400 font-sans normal-case text-sm">{currentPlan?.name}</span>
                </h4>
                <p className="text-[11px] text-gray-400">
                  {tenantCountPerPlan[selectedPlanId] || 0} entreprise(s) utilisent actuellement cette formule.
                </p>
              </div>
            </div>

            {/* Presets buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePresetActivateAll}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition flex items-center gap-1.5"
              >
                <CheckSquare className="w-3 h-3" />
                Tout Activer ({totalCount})
              </button>

              <button
                type="button"
                onClick={handlePresetEssentialPOS}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition flex items-center gap-1.5"
              >
                <ShoppingBag className="w-3 h-3" />
                Caisse & Stocks Seuls (5)
              </button>

              <button
                type="button"
                onClick={handlePresetResetDefaults}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-750 text-gray-300 border border-gray-700 transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Recommandation Forfait
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un module..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Module Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredModules.map(def => {
              const isEnabled = enabledModuleKeysForPlan.includes(def.key);
              const isCore = def.is_core;
              const IconComponent = MODULE_ICONS[def.icon] || Package;
              const rawDef = DEFAULT_MODULE_DEFINITIONS.find(d => d.key === def.key);
              const category = rawDef?.category || 'Commerce';

              return (
                <div
                  key={def.key}
                  onClick={() => !isCore && handleTogglePlanModule(def.key)}
                  className={`p-4 rounded-2xl border transition relative select-none flex flex-col justify-between ${
                    isCore
                      ? 'bg-gray-900/60 border-gray-800/80 cursor-default opacity-90'
                      : isEnabled
                        ? 'bg-gray-850/90 border-emerald-500/40 hover:border-emerald-500/80 cursor-pointer shadow-lg shadow-emerald-950/10'
                        : 'bg-gray-950/80 border-gray-800/80 hover:border-gray-700 cursor-pointer opacity-75 hover:opacity-100'
                  }`}
                >
                  <div>
                    {/* Top Row: Icon + Category + Switch */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isEnabled
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-gray-800/80 border-gray-700/60 text-gray-400'
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-500">
                            {category}
                          </span>
                          <h4 className="text-sm font-bold text-white font-sans leading-tight">
                            {def.label}
                          </h4>
                        </div>
                      </div>

                      {/* Interactive Switch */}
                      <div className="shrink-0 pt-0.5">
                        {isCore ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full">
                            <Lock className="w-2.5 h-2.5" />
                            Système
                          </span>
                        ) : (
                          <div
                            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                              isEnabled ? 'bg-emerald-600' : 'bg-gray-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                isEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-400 leading-relaxed min-h-[36px]">
                      {def.description}
                    </p>
                  </div>

                  {/* Status Indicator Bar */}
                  <div className="mt-4 pt-2.5 border-t border-gray-800/80 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-gray-500">
                      Clé: <code className="text-gray-400">{def.key}</code>
                    </span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        isCore
                          ? 'text-amber-400'
                          : isEnabled
                            ? 'text-emerald-400'
                            : 'text-gray-500'
                      }`}
                    >
                      {isCore ? (
                        'Inclus Obligatoire'
                      ) : isEnabled ? (
                        <>
                          <Check className="w-3 h-3" />
                          Actif dans l'interface
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" />
                          Masqué pour le client
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: TENANT-SPECIFIC MODULE OVERRIDES                                  */}
      {/* ========================================================================= */}
      {activeViewMode === 'tenants' && (
        <div className="space-y-6">
          {/* Tenant Selector Header */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                  Dérogations Granulaires
                </span>
                <h3 className="text-base font-bold text-white mt-1 font-sans">
                  Gérer les Modules Spécifiques par Boutique / Client
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Permet d'activer un module optionnel (comme l'IA Gemini ou les Entrepôts) pour une entreprise précise, sans modifier le forfait global.
                </p>
              </div>

              {/* Tenant Dropdown */}
              <div className="w-full md:w-72">
                <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1">
                  Sélectionnez l'Entreprise :
                </label>
                <select
                  value={selectedTenantId}
                  onChange={e => setSelectedTenantId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-750 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-purple-500"
                >
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Forfait: {t.plan})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Specific Tenant Overview Card */}
          {currentTenant && (
            <div className="space-y-4">
              <div className="bg-gray-850/80 border border-purple-500/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {currentTenant.name}
                  </h4>
                  <p className="text-xs text-gray-400">
                    Forfait actuel : <strong className="text-blue-400">{currentTenant.plan}</strong> &bull; Statut : <strong className="text-emerald-400">{currentTenant.subscriptionStatus || 'ACTIF'}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLocalTenantModules(prev => {
                      const next = { ...prev };
                      delete next[selectedTenantId];
                      return next;
                    });
                    setIsSaved(false);
                    addNotification(`Dérogations réinitialisées pour ${currentTenant.name}.`);
                  }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-750 text-xs font-semibold text-gray-300 rounded-xl border border-gray-700 transition"
                >
                  Rétablir selon son Forfait
                </button>
              </div>

              {/* Module Table for this Tenant */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950/80 text-gray-400 font-mono text-[10px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3">Module Métier</th>
                      <th className="px-4 py-3">État par Défaut (Forfait)</th>
                      <th className="px-4 py-3">Dérogation Client</th>
                      <th className="px-4 py-3 text-right">Action Rapide</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {moduleDefinitions.map(def => {
                      const basePlanId = currentTenant.subscriptionPlanId || currentTenant.plan;
                      const planDefaultEnabled = (localPlanModules[basePlanId] || getDefaultModulesForPlan(basePlanId)).includes(def.key);
                      const tenantOverride = (localTenantModules[selectedTenantId] || {})[def.key];
                      const isInherited = tenantOverride === undefined;
                      const effectiveState = isInherited ? (def.is_core || planDefaultEnabled) : tenantOverride;

                      return (
                        <tr key={def.key} className="hover:bg-gray-850/40 transition">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-white font-sans">{def.label}</div>
                            <div className="text-[10px] text-gray-500">{def.description}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            {def.is_core ? (
                              <span className="text-[10px] font-mono text-amber-400">Système (Toujours actif)</span>
                            ) : planDefaultEnabled ? (
                              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Inclus dans {currentTenant.plan}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                                <X className="w-3 h-3" /> Non inclus
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {def.is_core ? (
                              <span className="text-[10px] font-mono text-gray-500">Non modifiable</span>
                            ) : isInherited ? (
                              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                Hérité du forfait ({effectiveState ? 'Actif' : 'Inactif'})
                              </span>
                            ) : tenantOverride ? (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                                Forcé : ACTIF (Dérogation accordée)
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 font-bold">
                                Forcé : MASQUÉ (Dérogation restreinte)
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            {!def.is_core && (
                              <div className="inline-flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantOverride(def.key, 'inherit')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                                    isInherited
                                      ? 'bg-blue-600 text-white'
                                      : 'text-gray-400 hover:text-gray-200'
                                  }`}
                                >
                                  Hériter
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantOverride(def.key, 'enabled')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                                    !isInherited && tenantOverride === true
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-gray-400 hover:text-emerald-400'
                                  }`}
                                >
                                  Activer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantOverride(def.key, 'disabled')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                                    !isInherited && tenantOverride === false
                                      ? 'bg-red-600 text-white'
                                      : 'text-gray-400 hover:text-red-400'
                                  }`}
                                >
                                  Bloquer
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Informative Footer Box */}
      <div className="bg-blue-500/5 border border-blue-500/15 p-4 rounded-2xl flex items-start gap-3 text-xs">
        <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-blue-300">Synchronisation & Sécurité d'accès</p>
          <p className="text-gray-400 leading-relaxed text-[11px]">
            Toutes les modifications apportées aux modules sont enregistrées localement et synchronisées en temps réel vers votre instance Firebase Firestore. Les clients sous un forfait dont un module est désactivé verront ce module disparaître de leur menu et de leurs accès instantanément.
          </p>
        </div>
      </div>
    </div>
  );
}
