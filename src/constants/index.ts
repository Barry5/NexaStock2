import type { TabType, UserRole } from '../types';
import type { LucideIcon } from 'lucide-react';

export const LOCAL_CACHE_KEY = 'nexastock_local_cache';
export const AUTH_TOKEN_KEY = 'nexastock_token';

export const LOADING_STEPS = [
  "Extraction de la situation des stocks en temps réel...",
  "Analyse des fréquences et de la vélocité des ventes récentes...",
  "Modélisation prédictive des points de rupture imminents...",
  "Calcul des coûts d'approvisionnement optimaux...",
  "Génération du rapport stratégique par Gemini 3.5..."
];

export const CHART_COLORS = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];

export const EXPENSE_CATEGORIES = [
  'Loyer', 'Électricité', 'Salaires', 'Achat Stock', 'Marketing', 'Fournitures', 'Impôts'
];

export const PAYMENT_METHODS = [
  'Virement', 'Carte Bancaire', 'Espèces', 'Chèque'
];

export const LOAN_TYPES = [
  { value: 'entrant', label: 'Emprunt contracté (Nous devons)' },
  { value: 'sortant', label: 'Fonds prêtés (On nous doit)' }
] as const;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  TRIAL: 'Essai',
  PENDING: 'En attente',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  CANCELED: 'Annulé',
  BLOCKED: 'Bloqué',
  RENEWAL_PENDING: 'Renouvellement'
};

export const DEFAULT_PRICING_PLANS = [
  {
    id: 'plan-free',
    name: 'Starter / Essai',
    description: 'Idéal pour démarrer, tester l\'écosystème et évaluer les fonctionnalités.',
    price: 0,
    currency: 'EUR',
    durationDays: 14,
    badge: 'Essai 14 jours',
    isPopular: false,
    billingInterval: 'month' as const,
    features: [
      'Point de Vente (POS) & Encaissements',
      'Jusqu\'à 100 produits dans le catalogue',
      'Gestion des clients & historique basique',
      '1 utilisateur / caissier connecté',
      'Reçus de caisse & Factures standards',
      'Synchronisation locale hors-ligne'
    ],
    limits: {
      maxProducts: 100,
      maxSales: 250,
      maxCustomers: 50,
      maxUsers: 1,
      maxWarehouses: 1,
      storageLimitMb: 100,
      backupSupported: false,
      exportSupported: false,
      apiSupported: false
    },
    color: 'gray',
    displayOrder: 1,
    active: true
  },
  {
    id: 'plan-standard',
    name: 'Standard / Business',
    description: 'La solution complète pour les commerces, boutiques et PME en pleine croissance.',
    price: 29,
    currency: 'EUR',
    durationDays: 30,
    badge: '⭐ Le Plus Populaire',
    isPopular: true,
    billingInterval: 'month' as const,
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
    limits: {
      maxProducts: 5000,
      maxSales: 99999,
      maxCustomers: 5000,
      maxUsers: 5,
      maxWarehouses: 2,
      storageLimitMb: 1024,
      backupSupported: true,
      exportSupported: true,
      apiSupported: false
    },
    color: 'blue',
    displayOrder: 2,
    active: true
  },
  {
    id: 'plan-premium',
    name: 'Pro / Entreprise & IA',
    description: 'Toute la puissance de l\'IA et du multi-boutiques pour les réseaux et grands distributeurs.',
    price: 79,
    currency: 'EUR',
    durationDays: 30,
    badge: '👑 Tout Inclus & IA',
    isPopular: false,
    billingInterval: 'month' as const,
    features: [
      'Tout le forfait Standard inclus',
      'Produits & Ventes sans aucune limite',
      'Jusqu\'à 25 collaborateurs avec rôles avancés',
      'Assistant IA Gemini pour réapprovisionnement prédictif',
      'Multi-Boutiques & Transferts inter-dépôts illimités',
      'Gestion avancée des commissions & livreurs',
      'Sauvegarde continue & Synchronisation temps réel',
      'Rapprochement bancaire & Registre d\'audit',
      'Support VIP dédié 24/7 avec assistance directe'
    ],
    limits: {
      maxProducts: 999999,
      maxSales: 999999,
      maxCustomers: 999999,
      maxUsers: 25,
      maxWarehouses: 10,
      storageLimitMb: 10240,
      backupSupported: true,
      exportSupported: true,
      apiSupported: true
    },
    color: 'purple',
    displayOrder: 3,
    active: true
  },
  {
    id: 'plan-enterprise-annual',
    name: 'Illimité Annuel VIP',
    description: 'Tranquillité totale sur 1 an avec 2 mois offerts et accompagnement personnalisé.',
    price: 699,
    currency: 'EUR',
    durationDays: 365,
    badge: '🚀 2 Mois Offerts (-20%)',
    isPopular: false,
    billingInterval: 'year' as const,
    features: [
      'Toutes les fonctionnalités Pro & IA Gemini incluses',
      'Utilisateurs illimités pour toute l\'organisation',
      'Nombre de boutiques et dépôts illimités',
      'Accès direct aux API REST / Webhooks',
      'Exportation automatique des sauvegardes',
      'Formation personnalisée de l\'équipe incluse',
      'Interlocuteur technique dédié et SLA 99.9%'
    ],
    limits: {
      maxProducts: 9999999,
      maxSales: 9999999,
      maxCustomers: 9999999,
      maxUsers: 999,
      maxWarehouses: 99,
      storageLimitMb: 51200,
      backupSupported: true,
      exportSupported: true,
      apiSupported: true
    },
    color: 'amber',
    displayOrder: 4,
    active: true
  }
];

export const DEFAULT_SAAS_SETTINGS = {
  trialDays: 14,
  gracePeriodDays: 5,
  revertToPlanOnExpiry: 'Free' as const,
  orangeMoneyNumber: '+224 620 00 00 00',
  orangeMoneyName: 'NexaStock SAS',
  mobileMoneyNumber: '+224 660 11 22 33',
  mobileMoneyName: 'Hassim Barry',
  bankDetails: 'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
  paymentInstructions: 'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.',
  automaticActivation: false,
  saasCurrency: 'EUR'
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validée',
  cancelled: 'Annulée',
  archived: 'Archivée'
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  not_delivered: 'Non livrée',
  partially_delivered: 'Partiellement livrée',
  fully_delivered: 'Livrée totalement',
  cancelled: 'Annulée'
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Non payé',
  partially_paid: 'Partiellement payé',
  paid: 'Payé',
  overdue: 'En retard',
  cancelled: 'Annulé'
};

export const DELIVERY_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'En préparation',
  validated: 'Validé',
  in_transit: 'En cours de livraison',
  delivered: 'Livré',
  cancelled: 'Annulé'
};

export const PAYMENT_METHODS_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Virement bancaire',
  check: 'Chèque'
};

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  sale: 'Facture de vente',
  purchase: "Facture d'achat",
  credit_note: 'Avoir',
  debit_note: 'Note de débit'
};

export const AFFILIATE_STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  blocked: 'Bloqué'
};

export const COMMISSION_RULE_TYPES: Record<string, string> = {
  fixed_product: 'Fixe par produit',
  fixed_category: 'Fixe par catégorie',
  percentage: 'Pourcentage',
  margin: 'Selon la marge',
  per_affiliate: 'Par apporteur',
  per_client: 'Par client',
  per_quantity: 'Par quantité vendue',
  per_revenue: 'Par chiffre d\'affaires',
  campaign: 'Campagne promotionnelle'
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  available: 'Disponible',
  to_pay: 'À payer',
  partially_paid: 'Partiellement payée',
  paid: 'Payée',
  suspended: 'Suspendue',
  blocked: 'Bloquée',
  cancelled: 'Annulée',
  recalculated: 'Recalculée'
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  commission: 'Commission',
  bonus: 'Bonus',
  bonus_exceptional: 'Prime exceptionnelle',
  adjustment_positive: 'Ajustement positif',
  payment: 'Paiement',
  correction: 'Correction',
  cancellation: 'Annulation',
  return: 'Retour marchandise',
  regularization: 'Régularisation'
};

export const COMMISSION_PAYMENT_METHODS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'wave', label: 'Wave' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'card', label: 'Carte bancaire' }
];

export const ROLE_SPECS: Record<string, { label: string; desc: string }> = {
  owner: {
    label: 'Owner / Propriétaire',
    desc: 'Accès complet absolu : configuration, abonnements, POS, inventaire, finances, et gestion complète des utilisateurs.',
  },
  admin: {
    label: 'Admin / Administrateur',
    desc: 'Accès total à la boutique : gestion de stock, facturation, POS, comptabilité, et gestion des rôles de l\'équipe.',
  },
  gerant: {
    label: 'Gérant de Boutique',
    desc: 'Accès opérationnel complet : point de vente (POS), gestion des produits et stocks, et rapports de base.',
  },
  vendeur: {
    label: 'Vendeur de Caisse',
    desc: 'Limité au point de vente (POS) : encaissement des paniers, gestion des clients simples.',
  },
  comptable: {
    label: 'Comptable',
    desc: 'Dédié aux finances : gestion du registre des dépenses, prêts, bilans. Accès en lecture seule au catalogue.',
  },
  stock_manager: {
    label: 'Gestionnaire de Stock',
    desc: 'Dédié à la logistique : gestion des produits, transferts d\'entrepôts, alertes de rupture, réapprovisionnement intelligent.',
  },
  lecture_seule: {
    label: 'Lecture Seule / Auditeur',
    desc: 'Accès en visualisation pure sur l\'ensemble de l\'activité.',
  }
};

export interface SystemModuleConfig {
  key: string;
  label: string;
  category: 'Général' | 'Commerce' | 'Finances' | 'Logistique' | 'Intelligence' | 'Sécurité';
  description: string;
  icon: string;
  is_core: boolean;
  display_order: number;
  color: string;
}

export const DEFAULT_MODULE_DEFINITIONS: SystemModuleConfig[] = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    category: 'Général',
    description: 'Indicateurs clés de performance, statistiques de vente et alertes d\'activité en temps réel.',
    icon: 'LayoutDashboard',
    is_core: true,
    display_order: 1,
    color: 'blue'
  },
  {
    key: 'products',
    label: 'Produits & Stocks',
    category: 'Commerce',
    description: 'Gestion du catalogue, codes-barres, seuils d\'alerte et mouvements de stock.',
    icon: 'Package',
    is_core: false,
    display_order: 2,
    color: 'amber'
  },
  {
    key: 'sales',
    label: 'Point de Vente (POS)',
    category: 'Commerce',
    description: 'Interface de caisse rapide, panier tactile, encaissements et tickets de caisse.',
    icon: 'ShoppingBag',
    is_core: false,
    display_order: 3,
    color: 'emerald'
  },
  {
    key: 'invoices',
    label: 'Facturation ERP & Devis',
    category: 'Finances',
    description: 'Émission de factures professionnelles, devis, acomptes et avoirs normalisés.',
    icon: 'FileText',
    is_core: false,
    display_order: 4,
    color: 'blue'
  },
  {
    key: 'delivery-notes',
    label: 'Bons de Livraison (BL)',
    category: 'Logistique',
    description: 'Gestion des expéditions, bordereaux de livraison et validation des réceptions.',
    icon: 'Truck',
    is_core: false,
    display_order: 5,
    color: 'cyan'
  },
  {
    key: 'customers',
    label: 'Clients & Grossistes (CRM)',
    category: 'Commerce',
    description: 'Fichier clients, suivi des encours de crédit et historique d\'achats.',
    icon: 'Users',
    is_core: false,
    display_order: 6,
    color: 'indigo'
  },
  {
    key: 'expenses',
    label: 'Dépenses & Trésorerie',
    category: 'Finances',
    description: 'Registre des charges d\'exploitation, dettes, emprunts et état financier.',
    icon: 'Coins',
    is_core: false,
    display_order: 7,
    color: 'rose'
  },
  {
    key: 'ai',
    label: 'Assistant IA Gemini',
    category: 'Intelligence',
    description: 'Intelligence artificielle prédictive de réapprovisionnement et analyse des tendances.',
    icon: 'Sparkles',
    is_core: false,
    display_order: 8,
    color: 'purple'
  },
  {
    key: 'commissions',
    label: 'Apporteurs & Commissions',
    category: 'Commerce',
    description: 'Suivi des partenaires apporteurs d\'affaires, calculs et règlements des commissions.',
    icon: 'Award',
    is_core: false,
    display_order: 9,
    color: 'amber'
  },
  {
    key: 'warehouses',
    label: 'Multi-Entrepôts & Dépôts',
    category: 'Logistique',
    description: 'Gestion de multiples magasins, dépôts de stockage et transferts inter-sites.',
    icon: 'Building',
    is_core: false,
    display_order: 10,
    color: 'teal'
  },
  {
    key: 'users',
    label: 'Équipe & Permissions (RBAC)',
    category: 'Sécurité',
    description: 'Gestion des comptes collaborateurs, attribution de rôles et droits d\'accès granulaires.',
    icon: 'ShieldCheck',
    is_core: false,
    display_order: 11,
    color: 'sky'
  },
  {
    key: 'settings',
    label: 'Paramètres & Forfaits',
    category: 'Général',
    description: 'Configuration générale de l\'entreprise, devises, TVA et gestion de l\'abonnement.',
    icon: 'Settings',
    is_core: true,
    display_order: 12,
    color: 'gray'
  }
];

export function getDefaultModulesForPlan(planIdOrName: string = ''): string[] {
  const norm = planIdOrName.toLowerCase();
  
  // Starter / Free / Essai
  if (norm.includes('free') || norm.includes('starter') || norm.includes('essai') || norm === 'plan-free') {
    return ['dashboard', 'products', 'sales', 'customers', 'settings'];
  }
  
  // Standard / Business / PME
  if (norm.includes('standard') || norm.includes('business') || norm === 'plan-standard') {
    return ['dashboard', 'products', 'sales', 'invoices', 'delivery-notes', 'customers', 'expenses', 'commissions', 'settings'];
  }
  
  // Pro / Entreprise / IA / Annual VIP
  if (
    norm.includes('pro') ||
    norm.includes('premium') ||
    norm.includes('entreprise') ||
    norm.includes('annual') ||
    norm.includes('annuel') ||
    norm.includes('vip') ||
    norm.includes('illimite') ||
    norm.includes('illimité') ||
    norm === 'plan-premium' ||
    norm === 'plan-enterprise-annual'
  ) {
    return [
      'dashboard',
      'products',
      'sales',
      'invoices',
      'delivery-notes',
      'customers',
      'expenses',
      'ai',
      'commissions',
      'warehouses',
      'users',
      'settings'
    ];
  }

  // Default fallback if unknown plan: give Standard bundle
  return ['dashboard', 'products', 'sales', 'invoices', 'delivery-notes', 'customers', 'expenses', 'commissions', 'settings'];
}

