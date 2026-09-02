import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RefreshCw,
  Check,
  CreditCard,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Sparkles,
  Star,
  Crown,
  Zap,
  Building2,
  Users,
  Package,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
  Eye,
  Sliders,
  X
} from 'lucide-react';
import type { PricingPlan } from '../../types';

interface AdminPlansProps {
  localGlobalSaaSSettings: any;
  globalSaaSSettings: any;
  localPricingPlans: any[];
  pricingPlans: any[];
  localSaasCurrency: string;
  tenants: any[];
  setLocalSaasCurrency: (v: string) => void;
  setLocalPricingPlans: React.Dispatch<React.SetStateAction<any[]>>;
  isSaaSSettingsSaved: boolean;
  isSaaSSettingsSaving: boolean;
  handleSaveAllSaaSSettings: () => void;
  handleSavePlanSettings: (idx: number, field: string, value: any) => void;
  handleSaveGlobalPaymentsSettings: (field: string, value: any) => void;
}

const PLAN_COLORS = [
  { value: 'blue', label: 'Bleu Royal (Standard)', bg: 'bg-blue-500' },
  { value: 'purple', label: 'Violet IA (Pro/Entreprise)', bg: 'bg-purple-500' },
  { value: 'emerald', label: 'Émeraude (Croissance)', bg: 'bg-emerald-500' },
  { value: 'amber', label: 'Ambre / Or (VIP/Annuel)', bg: 'bg-amber-500' },
  { value: 'cyan', label: 'Cyan Tech', bg: 'bg-cyan-500' },
  { value: 'gray', label: 'Gris Neutre (Essai/Starter)', bg: 'bg-gray-500' }
];

const SUGGESTED_FEATURES = [
  'Point de Vente (POS) & Encaissements',
  'Catalogue produits & gestion code-barres',
  'Ventes & facturation illimitées',
  'Multi-caisses & sessions caissiers',
  'Alertes de rupture & réapprovisionnement',
  'Assistant IA Gemini prédictif',
  'Multi-Boutiques & transferts de stocks',
  'Gestion des commissions & livreurs',
  'Exports Excel, CSV et bilans comptables',
  'Sauvegarde Cloud & Firestore temps réel',
  'Support dédié 24/7 & assistance VIP',
  'Accès API REST & Webhooks'
];

const PRESET_TEMPLATES = [
  {
    name: 'Starter / Essai',
    description: 'Idéal pour démarrer, tester l\'écosystème et évaluer les fonctionnalités.',
    price: 0,
    durationDays: 14,
    badge: 'Essai 14 jours',
    isPopular: false,
    color: 'gray',
    features: [
      'Point de Vente (POS) & Encaissements',
      'Jusqu\'à 100 produits dans le catalogue',
      '1 utilisateur / caissier connecté',
      'Reçus de caisse & factures standards',
      'Synchronisation locale hors-ligne'
    ],
    limits: { maxProducts: 100, maxSales: 250, maxCustomers: 50, maxUsers: 1, maxWarehouses: 1 }
  },
  {
    name: 'Standard / Business',
    description: 'La solution complète pour les commerces, boutiques et PME en pleine croissance.',
    price: 29,
    durationDays: 30,
    badge: '⭐ Le Plus Populaire',
    isPopular: true,
    color: 'blue',
    features: [
      'Ventes & Encaissements POS illimités',
      'Catalogue jusqu\'à 5 000 articles',
      'Jusqu\'à 5 utilisateurs et caissiers',
      'Multi-caisses & Sessions de caisse',
      'Alertes de stocks bas et réapprovisionnement',
      'Comptabilité, Factures, Devis & Dépenses',
      'Exports Excel, CSV et bilans financiers',
      '2 Entrepôts / Boutiques rattachés',
      'Support client prioritaire par email & chat'
    ],
    limits: { maxProducts: 5000, maxSales: 99999, maxCustomers: 5000, maxUsers: 5, maxWarehouses: 2 }
  },
  {
    name: 'Pro / Entreprise & IA',
    description: 'Toute la puissance de l\'IA et du multi-boutiques pour les réseaux et grands distributeurs.',
    price: 79,
    durationDays: 30,
    badge: '👑 Tout Inclus & IA',
    isPopular: false,
    color: 'purple',
    features: [
      'Tout le forfait Standard inclus',
      'Produits & Ventes sans aucune limite',
      'Jusqu\'à 25 collaborateurs avec rôles avancés',
      'Assistant IA Gemini pour réapprovisionnement prédictif',
      'Multi-Boutiques & Transferts inter-dépôts illimités',
      'Gestion avancée des commissions & livreurs',
      'Sauvegarde Cloud continue & Firestore temps réel',
      'Support VIP dédié 24/7 avec assistance directe'
    ],
    limits: { maxProducts: 999999, maxSales: 999999, maxCustomers: 999999, maxUsers: 25, maxWarehouses: 10 }
  },
  {
    name: 'Illimité Annuel VIP',
    description: 'Tranquillité totale sur 1 an avec 2 mois offerts et accompagnement personnalisé.',
    price: 699,
    durationDays: 365,
    badge: '🚀 2 Mois Offerts (-20%)',
    isPopular: false,
    color: 'amber',
    features: [
      'Toutes les fonctionnalités Pro & IA Gemini incluses',
      'Utilisateurs illimités pour toute l\'organisation',
      'Nombre de boutiques et dépôts illimités',
      'Accès direct aux API REST / Webhooks',
      'Exportation automatique des sauvegardes',
      'Formation personnalisée de l\'équipe incluse',
      'Interlocuteur technique dédié et SLA 99.9%'
    ],
    limits: { maxProducts: 9999999, maxSales: 9999999, maxCustomers: 9999999, maxUsers: 999, maxWarehouses: 99 }
  }
];

interface PlanForm {
  name: string;
  description: string;
  price: string;
  currency: string;
  durationDays: string;
  features: string[];
  maxProducts: string;
  maxSales: string;
  maxCustomers: string;
  maxUsers: string;
  maxWarehouses: string;
  color: string;
  displayOrder: string;
  active: boolean;
  badge: string;
  isPopular: boolean;
}

function emptyForm(currency: string): PlanForm {
  return {
    name: '',
    description: '',
    price: '29',
    currency,
    durationDays: '30',
    features: ['Ventes POS illimitées', 'Gestion de stocks & inventaire', 'Jusqu\'à 5 utilisateurs'],
    maxProducts: '5000',
    maxSales: '99999',
    maxCustomers: '1000',
    maxUsers: '5',
    maxWarehouses: '2',
    color: 'blue',
    displayOrder: '99',
    active: true,
    badge: '',
    isPopular: false,
  };
}

function planToForm(plan: any, currency: string): PlanForm {
  return {
    name: plan.name || '',
    description: plan.description || '',
    price: String(plan.price ?? 0),
    currency: plan.currency || currency,
    durationDays: String(plan.durationDays ?? 30),
    features: Array.isArray(plan.features) ? [...plan.features] : (plan.features ? String(plan.features).split(',').map((s: string) => s.trim()).filter(Boolean) : []),
    maxProducts: String(plan.limits?.maxProducts ?? 5000),
    maxSales: String(plan.limits?.maxSales ?? 99999),
    maxCustomers: String(plan.limits?.maxCustomers ?? 1000),
    maxUsers: String(plan.limits?.maxUsers ?? 1),
    maxWarehouses: String(plan.limits?.maxWarehouses ?? 1),
    color: plan.color || 'blue',
    displayOrder: String(plan.displayOrder ?? 99),
    active: plan.active !== false,
    badge: plan.badge || '',
    isPopular: !!plan.isPopular,
  };
}

export default function AdminPlans({
  localGlobalSaaSSettings,
  globalSaaSSettings,
  localPricingPlans,
  pricingPlans,
  localSaasCurrency,
  tenants,
  setLocalSaasCurrency,
  setLocalPricingPlans,
  isSaaSSettingsSaved,
  isSaaSSettingsSaving,
  handleSaveAllSaaSSettings,
  handleSavePlanSettings,
  handleSaveGlobalPaymentsSettings,
}: AdminPlansProps) {
  const currentSettings = localGlobalSaaSSettings || globalSaaSSettings;
  const currentPlans = localPricingPlans.length > 0 ? localPricingPlans : pricingPlans;
  const currentCurrency = localSaasCurrency;

  const [planModal, setPlanModal] = useState<{ index: number; form: PlanForm } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; id: string; name: string } | null>(null);
  const [newFeatureText, setNewFeatureText] = useState('');
  const [activeTab, setActiveTab] = useState<'plans' | 'payments'>('plans');

  const openCreate = () => setPlanModal({ index: -1, form: emptyForm(currentCurrency) });
  
  const openEdit = (idx: number) => {
    setPlanModal({ index: idx, form: planToForm(currentPlans[idx], currentCurrency) });
  };

  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    if (!planModal) return;
    setPlanModal({
      ...planModal,
      form: {
        ...planModal.form,
        name: preset.name,
        description: preset.description,
        price: String(preset.price),
        durationDays: String(preset.durationDays),
        badge: preset.badge || '',
        isPopular: preset.isPopular || false,
        color: preset.color || 'blue',
        features: [...preset.features],
        maxProducts: String(preset.limits.maxProducts),
        maxSales: String(preset.limits.maxSales),
        maxCustomers: String(preset.limits.maxCustomers),
        maxUsers: String(preset.limits.maxUsers),
        maxWarehouses: String(preset.limits.maxWarehouses),
      }
    });
  };

  const duplicatePlan = (idx: number) => {
    const target = currentPlans[idx];
    const cloned = {
      ...JSON.parse(JSON.stringify(target)),
      id: `plan-${Date.now()}`,
      name: `${target.name} (Copie)`,
      displayOrder: (target.displayOrder || 0) + 1,
    };
    setLocalPricingPlans(prev => [...prev, cloned]);
  };

  const saveModal = () => {
    if (!planModal) return;
    const f = planModal.form;
    const built: PricingPlan = {
      id: planModal.index === -1 ? `plan-${Date.now()}` : (currentPlans[planModal.index]?.id || `plan-${Date.now()}`),
      name: f.name.trim() || 'Nouveau Forfait',
      description: f.description,
      price: Math.max(0, Number(f.price) || 0),
      currency: f.currency || currentCurrency,
      durationDays: Math.max(1, Number(f.durationDays) || 30),
      features: f.features.filter(Boolean),
      limits: {
        maxProducts: Number(f.maxProducts) || 0,
        maxSales: Number(f.maxSales) || 0,
        maxCustomers: Number(f.maxCustomers) || 0,
        maxUsers: Math.max(1, Number(f.maxUsers) || 1),
        maxWarehouses: Math.max(1, Number(f.maxWarehouses) || 1),
      },
      color: f.color,
      displayOrder: Number(f.displayOrder) || 99,
      active: f.active,
      badge: f.badge.trim() || undefined,
      isPopular: f.isPopular,
    };

    if (planModal.index === -1) {
      setLocalPricingPlans(prev => [...prev, built]);
    } else {
      setLocalPricingPlans(prev =>
        prev.map((p: any, i: number) => (i === planModal.index ? { ...p, ...built } : p))
      );
    }
    setPlanModal(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const usage = tenants.filter(t => t.plan === deleteTarget.name).length;
    if (usage > 0) {
      window.alert(`Ce forfait est actuellement utilisé par ${usage} entreprise(s). Réaffectez leurs abonnements avant de procéder à la suppression.`);
      setDeleteTarget(null);
      return;
    }
    setLocalPricingPlans(prev => prev.filter((p: any) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const setForm = (patch: Partial<PlanForm>) =>
    setPlanModal(prev => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));

  const addFeatureToForm = (text: string) => {
    if (!text.trim() || !planModal) return;
    if (planModal.form.features.includes(text.trim())) return;
    setForm({ features: [...planModal.form.features, text.trim()] });
    setNewFeatureText('');
  };

  const removeFeatureFromForm = (idx: number) => {
    if (!planModal) return;
    setForm({ features: planModal.form.features.filter((_, i) => i !== idx) });
  };

  return (
    <motion.div
      key="plans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Top Header & Save Control Bar */}
      <div className="bg-gray-950 border border-gray-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/25 text-blue-400">
              Gestionnaire SaaS Central
            </span>
            <span className="text-xs text-gray-500 font-mono">
              {currentPlans.length} forfait(s) configuré(s)
            </span>
          </div>
          <h3 className="text-lg font-black text-white mt-1 font-sans">
            Configuration des Forfaits & Coordonnées de Règlement
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
            Créez, modifiez, dupliquez ou personnalisez les grilles tarifaires affichées à vos clients, réglez les seuils d'isolation (utilisateurs, produits, dépôts) et mettez à jour les coordonnées de paiement hors-plateforme.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Nouveau Forfait
          </button>

          <button
            onClick={handleSaveAllSaaSSettings}
            disabled={isSaaSSettingsSaving}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-lg ${
              isSaaSSettingsSaved 
                ? 'bg-emerald-600 text-white shadow-emerald-500/10' 
                : 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/15'
            }`}
          >
            {isSaaSSettingsSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
              </>
            ) : isSaaSSettingsSaved ? (
              <>
                <Check className="w-4 h-4" /> Enregistré !
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" /> Enregistrer Cloud
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs: Forfaits vs Paiements */}
      <div className="flex items-center gap-2 border-b border-gray-850 pb-2">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'plans'
              ? 'bg-gray-900 text-white border border-gray-800 shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Forfaits & Grille Tarifaire ({currentPlans.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'payments'
              ? 'bg-gray-900 text-white border border-gray-800 shadow-sm'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-purple-400" />
          <span>Coordonnées & Paramètres de Paiement (Orange Money, RIB...)</span>
        </button>
      </div>

      {/* TAB 1: PRICING PLANS LIST & EDITING */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          {/* Quick preset banners for fast creation */}
          <div className="bg-gray-950 border border-gray-855 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Modèles Prédéfinis (Création en 1-Clic) :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {PRESET_TEMPLATES.map((tmpl, tIdx) => (
                <button
                  key={tIdx}
                  onClick={() => {
                    const f = emptyForm(currentCurrency);
                    f.name = tmpl.name;
                    f.description = tmpl.description;
                    f.price = String(tmpl.price);
                    f.durationDays = String(tmpl.durationDays);
                    f.badge = tmpl.badge || '';
                    f.isPopular = tmpl.isPopular || false;
                    f.color = tmpl.color || 'blue';
                    f.features = [...tmpl.features];
                    f.maxProducts = String(tmpl.limits.maxProducts);
                    f.maxSales = String(tmpl.limits.maxSales);
                    f.maxCustomers = String(tmpl.limits.maxCustomers);
                    f.maxUsers = String(tmpl.limits.maxUsers);
                    f.maxWarehouses = String(tmpl.limits.maxWarehouses);
                    setPlanModal({ index: -1, form: f });
                  }}
                  className="text-left p-3 rounded-xl bg-gray-900 hover:bg-gray-850 border border-gray-800 hover:border-blue-500/40 transition group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white group-hover:text-blue-400 transition">{tmpl.name}</span>
                    <span className="text-[10px] font-mono text-gray-400 font-bold">{tmpl.price} {currentCurrency}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate mt-1">{tmpl.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* PLANS CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {currentPlans.map((pl: any, idx: number) => {
              const assignedCount = tenants.filter(t => t.plan === pl.name || t.subscriptionPlanId === pl.id).length;
              const isPopular = pl.isPopular || pl.id === 'plan-standard';

              return (
                <div
                  key={pl.id || idx}
                  className={`bg-gray-950 border rounded-2xl p-5 space-y-4 relative flex flex-col justify-between shadow-xl transition-all ${
                    pl.active === false
                      ? 'border-gray-800 opacity-60'
                      : isPopular
                      ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                      : 'border-gray-855 hover:border-gray-700'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Top Row: Name, Badge, Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-white font-sans">{pl.name}</h4>
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            pl.color === 'purple' ? 'bg-purple-500' :
                            pl.color === 'emerald' ? 'bg-emerald-500' :
                            pl.color === 'amber' ? 'bg-amber-500' :
                            pl.color === 'cyan' ? 'bg-cyan-500' : 'bg-blue-500'
                          }`} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{pl.description || 'Sans description'}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(idx)}
                          className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:border-gray-600 transition"
                          title="Modifier le forfait"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => duplicatePlan(idx)}
                          className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:border-gray-600 transition"
                          title="Dupliquer ce forfait"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ index: idx, id: pl.id, name: pl.name })}
                          className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-red-400 hover:text-red-300 hover:border-red-500/40 transition"
                          title="Supprimer le forfait"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Badge & Popular indicator */}
                    {(pl.badge || isPopular) && (
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 border border-purple-500/25 text-purple-300 inline-flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {pl.badge || '⭐ Le Plus Populaire'}
                        </span>
                      </div>
                    )}

                    {/* Price & Cycle Display */}
                    <div className="bg-gray-900 p-3 rounded-xl border border-gray-850 flex items-center justify-between">
                      <div>
                        <span className="text-2xl font-black font-mono text-white">
                          {Number(pl.price || 0).toLocaleString('fr-FR')}
                        </span>
                        <span className="text-xs font-bold text-gray-300 font-mono ml-1">
                          {pl.currency || currentCurrency}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-1">
                          / {pl.durationDays >= 365 ? 'an' : `${pl.durationDays || 30}j`}
                        </span>
                      </div>

                      <button
                        onClick={() => handleSavePlanSettings(idx, 'active', !pl.active)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition border ${
                          pl.active !== false
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                            : 'bg-gray-800 border-gray-700 text-gray-500'
                        }`}
                      >
                        {pl.active !== false ? 'Actif' : 'Inactif'}
                      </button>
                    </div>

                    {/* Limits Quotas Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-850 flex items-center justify-between">
                        <span className="text-gray-500">Utilisateurs :</span>
                        <span className="text-white font-bold">{pl.limits?.maxUsers >= 99 ? 'Illimités' : pl.limits?.maxUsers || 1}</span>
                      </div>
                      <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-850 flex items-center justify-between">
                        <span className="text-gray-500">Articles :</span>
                        <span className="text-white font-bold">{pl.limits?.maxProducts >= 9999 ? 'Illimités' : pl.limits?.maxProducts || 100}</span>
                      </div>
                      <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-850 flex items-center justify-between">
                        <span className="text-gray-500">Ventes :</span>
                        <span className="text-white font-bold">{pl.limits?.maxSales >= 9999 ? 'Illimitées' : pl.limits?.maxSales || 250}</span>
                      </div>
                      <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-850 flex items-center justify-between">
                        <span className="text-gray-500">Boutiques :</span>
                        <span className="text-white font-bold">{pl.limits?.maxWarehouses && pl.limits.maxWarehouses >= 10 ? 'Illimitées' : pl.limits?.maxWarehouses || 1}</span>
                      </div>
                    </div>

                    {/* Features Snippet */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-mono font-bold text-gray-500 uppercase">Fonctionnalités incluses ({Array.isArray(pl.features) ? pl.features.length : 0}) :</p>
                      <ul className="space-y-1">
                        {Array.isArray(pl.features) && pl.features.slice(0, 4).map((feat: string, fI: number) => (
                          <li key={fI} className="text-[11px] text-gray-300 flex items-center gap-1.5 truncate">
                            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span className="truncate">{feat}</span>
                          </li>
                        ))}
                        {Array.isArray(pl.features) && pl.features.length > 4 && (
                          <li className="text-[10px] text-gray-500 font-mono italic">
                            + {pl.features.length - 4} autre(s) fonctionnalité(s)...
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* Bottom Footer: Attached tenants count & edit trigger */}
                  <div className="pt-3 border-t border-gray-850 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Building2 className="w-3.5 h-3.5 text-gray-500" />
                      <strong className="text-white">{assignedCount}</strong> entreprise(s)
                    </span>
                    <button
                      onClick={() => openEdit(idx)}
                      className="text-blue-400 hover:text-blue-300 font-bold transition flex items-center gap-1"
                    >
                      Éditer <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: GLOBAL PAYMENT COORDINATES */}
      {activeTab === 'payments' && (
        <div className="bg-gray-950 border border-gray-855 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="border-b border-gray-850 pb-4">
            <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
              Coordonnées de paiement affichées aux clients (Offline Payment)
            </h4>
            <p className="text-xs text-gray-400 mt-1">
              Ces informations apparaîtront sur l'écran de déclaration de règlement lorsqu'un client choisit un forfait.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-3">
              <span className="text-xs font-bold text-orange-400 font-mono uppercase flex items-center gap-1.5">
                🍊 Orange Money
              </span>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro Orange Money *</label>
                <input
                  type="text"
                  value={currentSettings?.orangeMoneyNumber || ''}
                  onChange={(e) => handleSaveGlobalPaymentsSettings('orangeMoneyNumber', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono"
                  placeholder="+224 620 00 00 00"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Titulaire Compte Orange Money *</label>
                <input
                  type="text"
                  value={currentSettings?.orangeMoneyName || ''}
                  onChange={(e) => handleSaveGlobalPaymentsSettings('orangeMoneyName', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white"
                  placeholder="Nom de l'entreprise ou du gérant"
                />
              </div>
            </div>

            <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-3">
              <span className="text-xs font-bold text-yellow-400 font-mono uppercase flex items-center gap-1.5">
                💛 MTN / Mobile Money / Wave
              </span>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro Mobile Money / Wave *</label>
                <input
                  type="text"
                  value={currentSettings?.mobileMoneyNumber || ''}
                  onChange={(e) => handleSaveGlobalPaymentsSettings('mobileMoneyNumber', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono"
                  placeholder="+224 660 11 22 33"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Titulaire Compte Mobile Money *</label>
                <input
                  type="text"
                  value={currentSettings?.mobileMoneyName || ''}
                  onChange={(e) => handleSaveGlobalPaymentsSettings('mobileMoneyName', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white"
                  placeholder="Nom du titulaire"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Coordonnées bancaires complètes (RIB/IBAN/Banque) *</label>
              <textarea
                rows={3}
                value={currentSettings?.bankDetails || ''}
                onChange={(e) => handleSaveGlobalPaymentsSettings('bankDetails', e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono leading-relaxed"
                placeholder="RIB: FR76 1234 5678 9012 3456 7890 123&#10;Banque: Société Générale&#10;Titulaire: NexaStock SARL"
              />
            </div>
            <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Instructions détaillées de paiement client *</label>
              <textarea
                rows={3}
                value={currentSettings?.paymentInstructions || ''}
                onChange={(e) => handleSaveGlobalPaymentsSettings('paymentInstructions', e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white leading-relaxed"
                placeholder="Effectuez le paiement via le moyen de votre choix puis renseignez le numéro de transaction ci-dessous..."
              />
            </div>
          </div>

          {/* SaaS Core Lifecycle Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-850 pt-5 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Devise Principale du SaaS</label>
              <select
                value={currentCurrency}
                onChange={(e) => {
                  const newCurrency = e.target.value;
                  setLocalSaasCurrency(newCurrency);
                  setLocalPricingPlans((prev: any[]) => prev.map((p: any) => ({
                    ...p,
                    currency: newCurrency
                  })));
                }}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="GNF">GNF (FG)</option>
                <option value="XOF">XOF (CFA)</option>
                <option value="XAF">XAF (FCFA)</option>
                <option value="CAD">CAD ($)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Durée d'essai gratuit (jours)</label>
              <input
                type="number"
                value={currentSettings?.trialDays || 14}
                onChange={(e) => handleSaveGlobalPaymentsSettings('trialDays', Number(e.target.value))}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Période de grâce autorisée (jours)</label>
              <input
                type="number"
                value={currentSettings?.gracePeriodDays || 5}
                onChange={(e) => handleSaveGlobalPaymentsSettings('gracePeriodDays', Number(e.target.value))}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Forfait de repli après expiration</label>
              <select
                value={currentSettings?.revertToPlanOnExpiry || 'Free'}
                onChange={(e) => handleSaveGlobalPaymentsSettings('revertToPlanOnExpiry', e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-white font-medium text-xs"
              >
                <option value="Free">Plan Starter / Essai (Downgrade)</option>
                <option value="ReadOnly">Mode lecture seule strict</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT PRICING PLAN */}
      <AnimatePresence>
        {planModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setPlanModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-5 p-6 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-850 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white font-sans">
                      {planModal.index === -1 ? 'Créer un Nouveau Forfait' : `Modifier le Forfait : ${planModal.form.name}`}
                    </h4>
                    <p className="text-xs text-gray-400">
                      Définissez les caractéristiques commerciales et les seuils d'isolation du forfait.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setPlanModal(null)}
                  className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content */}
              <div className="space-y-4">
                {/* Basic Details: Name, Slogan, Color */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Nom du Forfait *</label>
                    <input
                      type="text"
                      required
                      value={planModal.form.name}
                      onChange={(e) => setForm({ name: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-white font-bold"
                      placeholder="ex: Pro / Entreprise"
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Couleur Thème</label>
                    <select
                      value={planModal.form.color}
                      onChange={(e) => setForm({ color: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white font-medium"
                    >
                      {PLAN_COLORS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Ordre Affichage</label>
                    <input
                      type="number"
                      value={planModal.form.displayOrder}
                      onChange={(e) => setForm({ displayOrder: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Slogan Description */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Slogan / Description Commerciale</label>
                  <input
                    type="text"
                    value={planModal.form.description}
                    onChange={(e) => setForm({ description: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-white"
                    placeholder="ex: La solution complète pour les commerces en pleine expansion..."
                  />
                </div>

                {/* Pricing & Duration */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-gray-900/60 p-3.5 rounded-xl border border-gray-800">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Tarif</label>
                    <input
                      type="number"
                      min="0"
                      value={planModal.form.price}
                      onChange={(e) => setForm({ price: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Devise</label>
                    <select
                      value={planModal.form.currency}
                      onChange={(e) => setForm({ currency: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GNF">GNF (FG)</option>
                      <option value="XOF">XOF (CFA)</option>
                      <option value="XAF">XAF (FCFA)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Durée (Jours)</label>
                    <input
                      type="number"
                      min="1"
                      value={planModal.form.durationDays}
                      onChange={(e) => setForm({ durationDays: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Statut Actif</label>
                    <button
                      type="button"
                      onClick={() => setForm({ active: !planModal.form.active })}
                      className={`w-full py-2 rounded-xl text-xs font-bold font-mono transition border uppercase ${
                        planModal.form.active
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-gray-800 border-gray-700 text-gray-500'
                      }`}
                    >
                      {planModal.form.active ? '✓ Actif' : 'Inactif'}
                    </button>
                  </div>
                </div>

                {/* Marketing Badges & Popular highlight */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900/60 p-3.5 rounded-xl border border-gray-800">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Badge Promotionnel (Optionnel)</label>
                    <input
                      type="text"
                      value={planModal.form.badge}
                      onChange={(e) => setForm({ badge: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      placeholder="ex: ⭐ Le Plus Populaire ou 🚀 2 Mois Offerts"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 sm:pt-6">
                    <label className="text-xs text-gray-300 font-bold flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planModal.form.isPopular}
                        onChange={(e) => setForm({ isPopular: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 bg-gray-900 border-gray-700"
                      />
                      <span>Mettre en avant ce forfait (Highlight bleu)</span>
                    </label>
                  </div>
                </div>

                {/* Quotas & Limitations */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                    Plafonds & Quotas d'Isolation (0 = Illimité ou 99999) :
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 space-y-1">
                      <label className="text-[9px] font-mono font-bold text-gray-400 uppercase">Utilisateurs</label>
                      <input
                        type="number"
                        value={planModal.form.maxUsers}
                        onChange={(e) => setForm({ maxUsers: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                      />
                    </div>
                    <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 space-y-1">
                      <label className="text-[9px] font-mono font-bold text-gray-400 uppercase">Articles Max</label>
                      <input
                        type="number"
                        value={planModal.form.maxProducts}
                        onChange={(e) => setForm({ maxProducts: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                      />
                    </div>
                    <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 space-y-1">
                      <label className="text-[9px] font-mono font-bold text-gray-400 uppercase">Ventes Max</label>
                      <input
                        type="number"
                        value={planModal.form.maxSales}
                        onChange={(e) => setForm({ maxSales: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                      />
                    </div>
                    <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 space-y-1">
                      <label className="text-[9px] font-mono font-bold text-gray-400 uppercase">Clients Max</label>
                      <input
                        type="number"
                        value={planModal.form.maxCustomers}
                        onChange={(e) => setForm({ maxCustomers: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                      />
                    </div>
                    <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800 space-y-1">
                      <label className="text-[9px] font-mono font-bold text-gray-400 uppercase">Dépôts / Boutiques</label>
                      <input
                        type="number"
                        value={planModal.form.maxWarehouses}
                        onChange={(e) => setForm({ maxWarehouses: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Features List Manager */}
                <div className="space-y-3 bg-gray-900/60 p-4 rounded-xl border border-gray-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase font-mono">
                      Fonctionnalités & Avantages Inclus ({planModal.form.features.length})
                    </label>
                  </div>

                  {/* Add feature input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newFeatureText}
                      onChange={(e) => setNewFeatureText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addFeatureToForm(newFeatureText);
                        }
                      }}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-white"
                      placeholder="Ajouter une ligne de fonctionnalité..."
                    />
                    <button
                      type="button"
                      onClick={() => addFeatureToForm(newFeatureText)}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition"
                    >
                      Ajouter
                    </button>
                  </div>

                  {/* Feature chips */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {planModal.form.features.map((feat, fI) => (
                      <div key={fI} className="flex items-center justify-between p-2 rounded-lg bg-gray-950 border border-gray-800 text-xs">
                        <span className="text-gray-200 flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          {feat}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFeatureFromForm(fI)}
                          className="text-gray-500 hover:text-red-400 transition p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Quick Feature Suggestions */}
                  <div className="pt-2 border-t border-gray-850 space-y-1.5">
                    <p className="text-[9px] font-mono text-gray-500 uppercase font-bold">Suggestions rapides :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_FEATURES.filter(f => !planModal.form.features.includes(f)).slice(0, 6).map((sug, sI) => (
                        <button
                          key={sI}
                          type="button"
                          onClick={() => addFeatureToForm(sug)}
                          className="text-[10px] bg-gray-950 hover:bg-gray-800 border border-gray-800 hover:border-blue-500/40 text-gray-400 hover:text-white px-2 py-1 rounded-lg transition font-mono"
                        >
                          + {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-850">
                <button
                  type="button"
                  onClick={() => setPlanModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-600 transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveModal}
                  disabled={!planModal.form.name.trim()}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 shadow-lg shadow-blue-500/20"
                >
                  {planModal.index === -1 ? 'Créer le Forfait' : 'Enregistrer les Modifications'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: DELETE CONFIRMATION */}
      <AnimatePresence>
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">Supprimer ce Forfait ?</h4>
                  <p className="text-xs text-gray-400">Cette action retirera l'offre de la grille tarifaire.</p>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed bg-gray-900 p-3 rounded-xl border border-gray-800">
                Êtes-vous certain de vouloir supprimer définitivement le forfait <strong className="text-white">{deleteTarget.name}</strong> ?
              </p>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-600 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition shadow-lg shadow-red-500/20"
                >
                  Confirmer la Suppression
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
