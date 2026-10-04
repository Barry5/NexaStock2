/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CreditCard,
  Layers,
  ShieldCheck,
  RefreshCw,
  Building,
  Check,
  Users,
  Lock,
  UserCircle,
  TrendingUp,
  Sparkles,
  Globe,
  Coins,
  Save,
  FileText,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Trash2,
  Clock,
  DollarSign,
  Palette,
  ArrowRight,
  Upload,
  Phone,
  Tag,
  Key,
  HelpCircle,
  Eye,
  EyeOff,
  Server
} from 'lucide-react';
import type { Tenant, User, SubscriptionPlan, UserRole, SubscriptionPayment, PricingPlan } from '../types';
import { useDB, useApp } from '../context';
import { provisionUserAccount, sendResetEmail, authErrorMessage, MIN_PASSWORD_LENGTH } from '../lib/authService';
import { newId, uuid } from '../lib/ids';
import { compressImageFile } from '../lib/imageCompression';
import { persistImage } from '../lib/imageStorage';
import { getTenantPlanStatus, getRemainingDays, getActivePlan, futurePaymentProviders } from '../lib/subscriptionUtils.js';
import { Modal } from './shared/Modal';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { AppearanceSettings } from '../pages/AppearanceSettings';
import ShopSettings from './settings/ShopSettings';
import SaaSSaasPanel from './settings/SaaSSaasPanel';
import TeamSettings from './settings/TeamSettings';
import TenantSettings from './settings/TenantSettings';
import BackupSettings from './settings/BackupSettings';
import AdminBackupCenter from './admin/AdminBackupCenter';
import AdminPlans from './admin/AdminPlans';
import { saveGlobalSaaSSettingsToFirestore, savePricingPlansToFirestore } from '../lib/firebaseSync';
import {
  requestDriveAccessToken,
  getActiveDriveToken,
  disconnectDrive,
  getDriveConnectionState,
  uploadBackupToDrive,
  listDriveBackups,
  downloadDriveBackup,
  mergeRestoredDataIntoDb,
} from '../services/googleDriveService';


export default function SaaSSettings() {
  const { db, handleUpdateDb, handleDeleteRecords, isSyncing, handleSyncFromServer, addNotification } = useDB();
  const { activeTenantId, activeUserId, handleSwitchTenant, handleSwitchUser, handleUpdateTenantPlan, setCurrentTab } = useApp();
  
  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const activeUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);

  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isSuperAdmin = activeUser?.role === 'superadmin';
  const [activeSettingsTab, setActiveSettingsTab] = useState<'boutique' | 'saas' | 'team' | 'tenants' | 'backup' | 'backupcenter' | 'admin-plans' | 'appearance'>('boutique');

  // Local state for AdminPlans sub-tab
  const [localGlobalSaaSSettings, setLocalGlobalSaaSSettings] = useState<any>(null);
  const [localPricingPlans, setLocalPricingPlans] = useState<any[]>([]);
  const [localSaasCurrency, setLocalSaasCurrency] = useState<string>('EUR');
  const [isSaaSSettingsSaved, setIsSaaSSettingsSaved] = useState(false);
  const [isSaaSSettingsSaving, setIsSaaSSettingsSaving] = useState(false);

  // Redirect away from superadmin tabs if not superadmin
  React.useEffect(() => {
    if ((activeSettingsTab === 'tenants' || activeSettingsTab === 'backupcenter' || activeSettingsTab === 'admin-plans') && !isSuperAdmin) {
      setActiveSettingsTab('boutique');
    }
  }, [activeSettingsTab, isSuperAdmin]);
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [shopCurrency, setShopCurrency] = useState('EUR');
  const [shopTaxRate, setShopTaxRate] = useState<number | string>(20);
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopLogo, setShopLogo] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // User Management local form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('vendeur');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Offline Payment local form state
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [paymentTargetPlan, setPaymentTargetPlan] = useState<PricingPlan | null>(null);
  const [payAmount, setPayAmount] = useState(29);
  const [payMethod, setPayMethod] = useState('Orange Money');
  const [payReference, setPayReference] = useState('');
  const [payNumTransaction, setPayNumTransaction] = useState('');
  const [payComment, setPayComment] = useState('');
  const [payReceiptSim, setPayReceiptSim] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupList, setBackupList] = useState<any[]>([]);
  const [backupLabel, setBackupLabel] = useState('Sauvegarde manuelle');
  const [backupStrategy, setBackupStrategy] = useState<'full' | 'incremental' | 'differential'>('full');
  const [backupDestination, setBackupDestination] = useState<'local' | 'remote'>('local');
  const [localRestoring, setLocalRestoring] = useState(false);
  const [localRestoreConfirm, setLocalRestoreConfirm] = useState<string | null>(null);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveEmail, setGdriveEmail] = useState<string | null>(null);
  const [gdriveBackups, setGdriveBackups] = useState<any[]>([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveRestoring, setGdriveRestoring] = useState(false);
  const [gdriveRestoreSteps, setGdriveRestoreSteps] = useState<string[]>([]);
  const [gdriveRestoreDone, setGdriveRestoreDone] = useState(false);
  const [gdriveSelectedBackup, setGdriveSelectedBackup] = useState<any | null>(null);
  const [gdriveTenantId, setGdriveTenantId] = useState<string>(activeTenantId);

  const [deleteTeamUserData, setDeleteTeamUserData] = useState<{ id: string; name: string } | null>(null);

  // Active pricing plans and global config resolved with safe defaults
  const pricingPlans = useMemo(() => {
    const currency = activeTenant?.currency || db.saasCurrency || 'EUR';
    const plans = db.pricingPlans && db.pricingPlans.length > 0 ? db.pricingPlans : [
      { id: 'plan-free', name: 'Free', description: 'Idéal pour tester l\'application.', price: 0, currency: 'EUR', durationDays: 14, features: [], limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }, color: 'gray', displayOrder: 1, active: true },
      { id: 'plan-standard', name: 'Standard', description: 'Pour les PME établies.', price: 29, currency: 'EUR', durationDays: 30, features: [], limits: { maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }, color: 'blue', displayOrder: 2, active: true },
      { id: 'plan-premium', name: 'Premium', description: 'Le summum de l\'intelligence.', price: 79, currency: 'EUR', durationDays: 30, features: [], limits: { maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }, color: 'purple', displayOrder: 3, active: true }
    ];
    return plans.map(p => ({
      ...p,
      currency
    }));
  }, [db.pricingPlans, db.saasCurrency, activeTenant?.currency]);

  const globalSaaSSettings = useMemo(() => {
    return db.globalSaaSSettings || {
      trialDays: 14,
      gracePeriodDays: 5,
      revertToPlanOnExpiry: 'Free',
      orangeMoneyNumber: '+224 620 00 00 00',
      orangeMoneyName: 'NexaStock SAS',
      mobileMoneyNumber: '+224 660 11 22 33',
      mobileMoneyName: 'Hassim Barry',
      bankDetails: 'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
      paymentInstructions: 'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.',
      automaticActivation: false
    };
  }, [db.globalSaaSSettings]);

  // Current tenant stats and limits
  const tenantPlanStatus = useMemo(() => {
    if (!activeTenant) return null;
    return getTenantPlanStatus(activeTenant, db);
  }, [activeTenant, db]);

  const remainingDays = useMemo(() => {
    if (!activeTenant) return { days: 0, isExpired: false, text: '' };
    return getRemainingDays(activeTenant);
  }, [activeTenant]);

  const tenantUsers = useMemo(() => {
    return db.users.filter(u => u.tenantId === activeTenantId);
  }, [db.users, activeTenantId]);

  const tenantPayments = useMemo(() => {
    return (db.subscriptionPayments || []).filter(p => p.tenantId === activeTenantId);
  }, [db.subscriptionPayments, activeTenantId]);

  useEffect(() => {
    if (activeTenant) {
      setShopName(activeTenant.name || '');
      setShopDescription(activeTenant.description || '');
      setShopCurrency(activeTenant.currency || 'EUR');
      setShopTaxRate(activeTenant.taxRate !== undefined ? activeTenant.taxRate : 20);
      setShopAddress(activeTenant.address || '');
      setShopPhone(activeTenant.phone || '');
      setShopLogo(activeTenant.logo || '');
      setIsSaved(false);
    }
  }, [activeTenant]);

  const formatSample = (val: number, currCode: string) => {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currCode.toUpperCase().trim(),
        minimumFractionDigits: 2
      }).format(val);
    } catch (err) {
      return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currCode.toUpperCase()}`;
    }
  };

  // SYNC-04 : logo redimensionné et compressé (limite de 1 Mio par document Firestore).
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 400);
      setShopLogo(dataUrl);
      // Phase 3 : envoi vers Cloud Storage ; seule l'URL sera enregistrée dans la boutique.
      const { url, stored } = await persistImage(dataUrl, { tenantId: activeTenantId, kind: 'logos', entityId: activeTenantId });
      if (stored) setShopLogo(current => (current === dataUrl ? url : current));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant) return;
    setSaveLoading(true);

    setTimeout(() => {
      const updatedTenant: Tenant = {
        ...activeTenant,
        name: shopName,
        description: shopDescription,
        currency: shopCurrency.toUpperCase().trim(),
        taxRate: shopTaxRate === '' ? 0 : Number(shopTaxRate),
        address: shopAddress,
        phone: shopPhone,
        logo: shopLogo
      };

      const audit: any = {
        id: `aud-${uuid()}`,
        timestamp: new Date().toISOString(),
        userId: activeUserId,
        userName: activeUser?.name || 'Système',
        action: 'PARAMETRES_BOUTIQUE_MODIFIES',
        details: `Identité, Devise (${shopCurrency}) et TVA de l'organisation mises à jour.`,
        tenantId: activeTenantId
      };

      const finalDb = {
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenant.id ? updatedTenant : t),
        auditLogs: [audit, ...(db.auditLogs || [])]
      };

      handleUpdateDb(finalDb);
      setSaveLoading(false);
      setIsSaved(true);

      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    }, 600);
  };

  // Sync Admin Plans local state
  useEffect(() => {
    setLocalGlobalSaaSSettings(globalSaaSSettings);
    setLocalPricingPlans(JSON.parse(JSON.stringify(pricingPlans)));
    setLocalSaasCurrency(db.saasCurrency || globalSaaSSettings?.saasCurrency || 'EUR');
  }, [globalSaaSSettings, pricingPlans, db.saasCurrency]);

  const handleSavePlanSettings = (idx: number, field: string, value: any) => {
    setLocalPricingPlans(prev => {
      const nextPlans = [...prev];
      if (field.startsWith('limits.')) {
        const limitField = field.split('.')[1];
        nextPlans[idx] = {
          ...nextPlans[idx],
          limits: {
            ...nextPlans[idx].limits,
            [limitField]: Number(value)
          }
        };
      } else {
        nextPlans[idx] = {
          ...nextPlans[idx],
          [field]: field === 'price' || field === 'durationDays' || field === 'displayOrder' ? Number(value) : value
        };
      }
      return nextPlans;
    });
  };

  const handleSaveGlobalPaymentsSettings = (field: string, value: any) => {
    setLocalGlobalSaaSSettings((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value
      };
    });
  };

  const handleSaveAllSaaSSettings = async () => {
    setIsSaaSSettingsSaving(true);
    try {
      const nextGlobalSettings = {
        ...(localGlobalSaaSSettings || globalSaaSSettings || {}),
        saasCurrency: localSaasCurrency
      };
      const nextPlans = (localPricingPlans && localPricingPlans.length > 0 ? localPricingPlans : pricingPlans).map((p: any) => ({
        ...p,
        currency: localSaasCurrency
      }));
      const updatedTenants = (db.tenants || []).map(t => ({
        ...t,
        currency: localSaasCurrency
      }));

      await saveGlobalSaaSSettingsToFirestore(nextGlobalSettings, localSaasCurrency).catch(err => {
        console.warn('Direct Firestore save failed, queued:', err);
      });
      await savePricingPlansToFirestore(nextPlans).catch(err => {
        console.warn('Direct pricing plans Firestore save failed:', err);
      });

      handleUpdateDb({
        ...db,
        saasCurrency: localSaasCurrency,
        globalSaaSSettings: nextGlobalSettings,
        pricingPlans: nextPlans,
        tenants: updatedTenants
      });

      setIsSaaSSettingsSaving(false);
      setIsSaaSSettingsSaved(true);
      addNotification(`Configuration globale du SaaS et devise (${localSaasCurrency}) sauvegardées avec succès !`, 'success');

      setTimeout(() => {
        setIsSaaSSettingsSaved(false);
      }, 3000);
    } catch (err: any) {
      console.error('Error saving SaaS settings:', err);
      setIsSaaSSettingsSaving(false);
      addNotification('Erreur lors de la sauvegarde des paramètres SaaS.', 'error');
    }
  };

  // Submit offline payment details
  const handleSubmitPaymentRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !paymentTargetPlan) return;

    const paymentId = `pm-${uuid()}`;
    const newPayment: SubscriptionPayment = {
      id: paymentId,
      tenantId: activeTenantId,
      tenantName: activeTenant.name,
      planId: paymentTargetPlan.id,
      planName: paymentTargetPlan.name,
      amount: payAmount,
      currency: paymentTargetPlan.currency || db.saasCurrency || 'EUR',
      paymentMethod: payMethod,
      reference: payReference,
      transactionNumber: payNumTransaction,
      date: new Date().toISOString().split('T')[0],
      comment: payComment,
      receiptImage: payReceiptSim || 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update Tenant Status to PENDING
    const updatedTenants = db.tenants.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          subscriptionStatus: 'PENDING' as const,
          subscriptionPlanId: paymentTargetPlan.id
        };
      }
      return t;
    });

    const audit: any = {
      id: `aud-${uuid()}`,
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Client',
      action: 'PAIEMENT_SOUMIS',
      details: `Déclaration de paiement hors plateforme de ${payAmount} ${paymentTargetPlan?.currency || db.saasCurrency || 'EUR'} (${payMethod}). Dossier en attente de validation. Ref: ${payReference}`,
      tenantId: activeTenantId
    };

    const nextDb = {
      ...db,
      tenants: updatedTenants,
      subscriptionPayments: [newPayment, ...(db.subscriptionPayments || [])],
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setPaymentSuccess(true);
    setTimeout(() => {
      setPaymentSuccess(false);
      setIsPaymentFormOpen(false);
      setPayReference('');
      setPayNumTransaction('');
      setPayComment('');
      setPayReceiptSim('');
    }, 3000);
  };

  // Manage Enterprise Users (CRUD)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !newUserName || !newUserEmail || !newUserPassword) return;

    // Plan limits check
    if (tenantPlanStatus && tenantPlanStatus.users.isLimitReached) {
      alert(`Limite de comptes d'utilisateurs atteinte pour votre plan actif (${tenantPlanStatus.users.max} max). Veuillez faire évoluer votre abonnement.`);
      return;
    }
    if (newUserPassword.length < MIN_PASSWORD_LENGTH) {
      alert(`Le mot de passe provisoire doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }

    const newUserObj: User = {
      id: newId('u'),
      name: newUserName,
      email: newUserEmail.trim().toLowerCase(),
      role: newUserRole,
      tenantId: activeTenantId,
      active: true,
      firstLoginReset: true // Force password modification on first connection
    };

    try {
      // SEC-02 : compte Firebase Auth + lien ; le mot de passe n'est jamais stocké dans Firestore.
      await provisionUserAccount(newUserObj, newUserPassword);
    } catch (err) {
      alert(authErrorMessage(err));
      return;
    }

    const audit: any = {
      id: newId('aud'),
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'TEAM_USER_CREATED',
      details: `Création du collaborateur ${newUserName} (${newUserRole}). Mot de passe provisoire à changer à la première connexion.`,
      tenantId: activeTenantId
    };

    await handleUpdateDb({
      ...db,
      users: [...db.users, newUserObj],
      auditLogs: [audit, ...(db.auditLogs || [])]
    });
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    alert(`Collaborateur ${newUserName} créé avec succès ! Il devra changer son mot de passe lors de sa première connexion.`);
  };

  const handleDeleteTeamUser = (userId: string, name: string) => {
    if (userId === activeUserId) {
      alert("Impossible de supprimer votre propre compte actif !");
      return;
    }
    setDeleteTeamUserData({ id: userId, name });
  };

  const confirmDeleteTeamUser = () => {
    if (!deleteTeamUserData) return;

    const audit: any = {
      id: newId('aud'),
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'TEAM_USER_REVOKED',
      details: `Révocation d'accès pour ${deleteTeamUserData.name}`,
      tenantId: activeTenantId
    };

    // Suppression explicite et logique + révocation du lien Auth.
    void handleDeleteRecords('users', [deleteTeamUserData.id]);
    void handleUpdateDb({ ...db, auditLogs: [audit, ...(db.auditLogs || [])] });
    setDeleteTeamUserData(null);
  };

  const handleOpenPasswordModal = (userId: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setShowResetPassword(true);
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetPasswordUserId) return;
    const target = db.users.find(u => u.id === resetPasswordUserId);
    if (!target) return;

    // SEC-02 : un administrateur ne fixe plus le mot de passe d'un tiers ; un lien de réinitialisation est envoyé.
    try {
      await sendResetEmail(target.email);
    } catch (err) {
      alert(authErrorMessage(err));
      return;
    }

    const audit: any = {
      id: newId('aud'),
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'MOT_DE_PASSE_REINITIALISATION_ENVOYEE',
      details: `Lien de réinitialisation envoyé à ${target.name}.`,
      tenantId: activeTenantId
    };

    void handleUpdateDb({
      ...db,
      users: db.users.map(u => u.id === resetPasswordUserId ? { ...u, firstLoginReset: true } : u),
      auditLogs: [audit, ...(db.auditLogs || [])]
    });
    addNotification(`Lien de réinitialisation envoyé à ${target.email}.`);
    setShowResetPassword(false);
    setResetPasswordUserId(null);
  };

  // Rôle de l'utilisateur authentifié (Firebase Auth) ; les règles Firestore appliquent le contrôle réel.
  const jwtRole = activeUser?.role ?? null;
  const isBackupAdmin = jwtRole === 'superadmin' || jwtRole === 'owner' || jwtRole === 'admin';

  useEffect(() => {
    if (!isBackupAdmin) return;
    const token = localStorage.getItem('nexastock_token');
    fetch('/api/admin/backups/enterprise', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => setBackupList(data.backups || []))
      .catch(() => setBackupList([]));
  }, [isBackupAdmin]);

  const handleCreateBackup = async () => {
    if (!isBackupAdmin) return;
    setBackupLoading(true);
    const token = localStorage.getItem('nexastock_token');
    try {
      const res = await fetch('/api/admin/backups/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          label: backupLabel,
          strategy: backupStrategy,
          destination: backupDestination,
          tenantId: activeTenantId,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la sauvegarde');
      addNotification(`Sauvegarde créée : ${data.backup.manifest.label}`, 'success');
      setBackupList(prev => [
        {
          id: data.backup.manifest.id,
          label: data.backup.manifest.label,
          strategy: data.backup.manifest.strategy,
          destination: data.backup.manifest.destination,
          createdAt: data.backup.manifest.createdAt,
          encrypted: data.backup.manifest.encrypted,
          size: data.backup.manifest.size,
          manifestPath: data.backup.manifestPath,
        },
        ...prev,
      ]);
    } catch (err: any) {
      addNotification(err.message || 'Erreur de sauvegarde', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleLocalRestore = async (manifestPath: string) => {
    if (!isBackupAdmin || localRestoring) return;
    setLocalRestoring(true);
    const token = localStorage.getItem('nexastock_token');
    try {
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ manifestPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la restauration');
      addNotification('Restauration réussie ! Rechargez la page.', 'success');
      setLocalRestoreConfirm(null);
    } catch (err: any) {
      addNotification(err.message || 'Erreur de restauration', 'error');
    } finally {
      setLocalRestoring(false);
    }
  };

  const authHeader = () => { const t = localStorage.getItem('nexastock_token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

  useEffect(() => {
    if (!isBackupAdmin) return;
    const state = getDriveConnectionState();
    if (state.connected) {
      setGdriveConnected(true);
      setGdriveEmail(state.email);
      getActiveDriveToken()
        .then(token => listDriveBackups(token, gdriveTenantId))
        .then(files => setGdriveBackups(files))
        .catch(() => {});
    }
  }, [isBackupAdmin, gdriveTenantId]);

  const handleGdriveConnect = async () => {
    setGdriveLoading(true);
    try {
      const { token, profile } = await requestDriveAccessToken();
      setGdriveConnected(true);
      setGdriveEmail(profile.email);
      addNotification(`Google Drive connecté avec succès : ${profile.email}`, 'success');
      const files = await listDriveBackups(token, gdriveTenantId);
      setGdriveBackups(files);
    } catch (err: any) {
      console.error('Erreur Google Drive Connect:', err);
      addNotification(err.message || 'Échec de la connexion à Google Drive', 'error');
    } finally {
      setGdriveLoading(false);
    }
  };

  const handleGdriveDisconnect = async () => {
    disconnectDrive();
    setGdriveConnected(false);
    setGdriveEmail(null);
    setGdriveBackups([]);
    setGdriveSelectedBackup(null);
    addNotification('Google Drive déconnecté', 'info');
  };

  const handleGdriveUpload = async () => {
    if (!isBackupAdmin) return;
    setGdriveLoading(true);
    try {
      const token = await getActiveDriveToken();
      const { file, manifest } = await uploadBackupToDrive(token, {
        db,
        tenantId: gdriveTenantId,
        label: backupLabel,
        strategy: backupStrategy,
      });
      addNotification(`Sauvegarde créée sur Google Drive : ${manifest.label}`, 'success');
      setBackupLabel('');
      setGdriveBackups(prev => [file, ...prev]);
    } catch (err: any) {
      console.error('Erreur Google Drive Upload:', err);
      addNotification(err.message || 'Erreur lors de la sauvegarde sur Google Drive', 'error');
    } finally {
      setGdriveLoading(false);
    }
  };

  const handleLoadGdriveBackups = async () => {
    setGdriveLoading(true);
    try {
      const token = await getActiveDriveToken();
      const files = await listDriveBackups(token, gdriveTenantId);
      setGdriveBackups(files);
      addNotification(`${files.length} sauvegarde(s) Google Drive trouvée(s)`, 'info');
    } catch (err: any) {
      console.error('Erreur Google Drive List:', err);
      addNotification(err.message || 'Impossible de lister les sauvegardes Google Drive', 'error');
    } finally {
      setGdriveLoading(false);
    }
  };

  const handleGdriveRestore = async () => {
    if (!gdriveSelectedBackup) return;
    setGdriveRestoring(true);
    setGdriveRestoreSteps([]);
    setGdriveRestoreDone(false);
    const steps = ['Produits', 'Clients', 'Ventes', 'Stock', 'Paiements'];
    try {
      const token = await getActiveDriveToken();
      const payload = await downloadDriveBackup(token, gdriveSelectedBackup.id);

      // Simulation de la progression par étape
      for (const step of steps) {
        await new Promise(r => setTimeout(r, 450));
        setGdriveRestoreSteps(prev => [...prev, step]);
      }

      // Fusion des données dans l'état local et cloud
      const nextDb = mergeRestoredDataIntoDb(db, payload.data, gdriveTenantId);
      handleUpdateDb(nextDb);

      setGdriveRestoreDone(true);
      addNotification('Restauration Google Drive terminée avec succès !', 'success');
    } catch (err: any) {
      console.error('Erreur Google Drive Restore:', err);
      addNotification(err.message || 'Erreur de restauration depuis Google Drive', 'error');
      setGdriveRestoring(false);
    }
  };

  const permissionsMatrix = [
    { action: "Saisir des ventes (Caisse POS)", admin: true, gerant: true, vendeur: true },
    { action: "Gérer le catalogue (Produits & Prix)", admin: true, gerant: true, vendeur: false },
    { action: "Module dépenses & financements", admin: true, gerant: true, vendeur: false },
    { action: "Réapprovisionnement Intelligent (Gemini IA)", admin: true, gerant: false, vendeur: false },
    { action: "Changer de plan de facturation SaaS", admin: true, gerant: false, vendeur: false },
    { action: "Supprimer des écritures d'audit comptable", admin: true, gerant: false, vendeur: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in text-white">
      
      {/* Settings Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-850 backdrop-blur-md tabs-scrollable">
        <button
          onClick={() => setActiveSettingsTab('boutique')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'boutique' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Building className="w-3.5 h-3.5" /> Identité & Devise Boutique
        </button>
        <button
          onClick={() => setActiveSettingsTab('saas')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'saas' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" /> Forfaits & Abonnements SaaS
        </button>
        <button
          onClick={() => setActiveSettingsTab('team')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'team' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Gestion des Utilisateurs d'Entreprise
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSettingsTab('tenants')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
              activeSettingsTab === 'tenants' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Multi-Boutiques (Isolation SaaS)
          </button>
        )}
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSettingsTab('backupcenter')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
              activeSettingsTab === 'backupcenter' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Server className="w-3.5 h-3.5" /> Sauvegardes Système (Root)
          </button>
        )}
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSettingsTab('admin-plans')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
              activeSettingsTab === 'admin-plans'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-purple-300 hover:text-white hover:bg-purple-950/40 border border-purple-500/20'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Éditeur de Forfaits SaaS (Superadmin)
          </button>
        )}
        <button
          onClick={() => setActiveSettingsTab('backup')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'backup' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Sauvegardes & Restauration
        </button>
        <button
          onClick={() => setActiveSettingsTab('appearance')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'appearance' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Palette className="w-3.5 h-3.5" /> Apparence
        </button>
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: BOUTIQUE IDENTITY & LOCALIZATION SETTINGS */}
        {activeSettingsTab === 'boutique' && (
          <motion.div
            key="boutique"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <ShopSettings
              activeTenant={activeTenant}
              shopName={shopName} setShopName={setShopName}
              shopDescription={shopDescription} setShopDescription={setShopDescription}
              shopCurrency={shopCurrency} setShopCurrency={setShopCurrency}
              shopTaxRate={shopTaxRate} setShopTaxRate={setShopTaxRate}
              shopAddress={shopAddress} setShopAddress={setShopAddress}
              shopPhone={shopPhone} setShopPhone={setShopPhone}
              shopLogo={shopLogo} setShopLogo={setShopLogo}
              isSaved={isSaved}
              saveLoading={saveLoading}
              handleSaveSettings={handleSaveSettings}
              handleLogoUpload={handleLogoUpload}
              formatSample={formatSample}
            />
          </motion.div>
        )}
        
        {/* TAB 2: SAAS PLANS SUBSCRIPTIONS & OFFLINE PAYMENTS */}
        {activeSettingsTab === 'saas' && (
          <motion.div
            key="saas"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <SaaSSaasPanel
              tenantPlanStatus={tenantPlanStatus}
              remainingDays={remainingDays}
              activeTenant={activeTenant}
              pricingPlans={pricingPlans}
              paymentTargetPlan={paymentTargetPlan}
              setPaymentTargetPlan={setPaymentTargetPlan}
              payAmount={payAmount}
              setPayAmount={setPayAmount}
              setIsPaymentFormOpen={setIsPaymentFormOpen}
              handleSubmitPaymentRequest={handleSubmitPaymentRequest}
              globalSaaSSettings={globalSaaSSettings}
              payMethod={payMethod}
              setPayMethod={setPayMethod}
              payReference={payReference}
              setPayReference={setPayReference}
              payNumTransaction={payNumTransaction}
              setPayNumTransaction={setPayNumTransaction}
              payComment={payComment}
              setPayComment={setPayComment}
              payReceiptSim={payReceiptSim}
              setPayReceiptSim={setPayReceiptSim}
              paymentSuccess={paymentSuccess}
              tenantPayments={tenantPayments}
              isSyncing={isSyncing}
              handleSyncFromServer={handleSyncFromServer}
              db={db}
              isAdmin={isSuperAdmin || activeUser?.role === 'superadmin' || activeUser?.role === 'owner' || activeUser?.role === 'admin'}
              onOpenAdminPlans={() => setActiveSettingsTab('admin-plans')}
            />
          </motion.div>
        )}
        
        {/* TAB 3: ENTERPRISE TEAM & USER MANAGEMENT (CLIENT SIDE CRITICAL SPEC) */}
        {activeSettingsTab === 'team' && (
          <motion.div
            key="team"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <TeamSettings
              tenantUsers={tenantUsers}
              tenantPlanStatus={tenantPlanStatus}
              handleCreateUser={handleCreateUser}
              handleDeleteTeamUser={handleDeleteTeamUser}
              handleOpenPasswordModal={handleOpenPasswordModal}
              newUserName={newUserName}
              setNewUserName={setNewUserName}
              newUserEmail={newUserEmail}
              setNewUserEmail={setNewUserEmail}
              newUserPassword={newUserPassword}
              setNewUserPassword={setNewUserPassword}
              newUserRole={newUserRole}
              setNewUserRole={setNewUserRole}
              activeUserId={activeUserId}
              handleSwitchUser={handleSwitchUser}
              db={db}
              activeTenantId={activeTenantId}
            />
          </motion.div>
        )}
        
        {/* TAB: BACKUP AND RESTORE */}
        {activeSettingsTab === 'backup' && (
          <motion.div key="backup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <BackupSettings
              isBackupAdmin={isBackupAdmin}
              backupLoading={backupLoading}
              backupList={backupList}
              backupLabel={backupLabel}
              setBackupLabel={setBackupLabel}
              backupStrategy={backupStrategy}
              setBackupStrategy={setBackupStrategy}
              handleCreateBackup={handleCreateBackup}
              localRestoring={localRestoring}
              localRestoreConfirm={localRestoreConfirm}
              setLocalRestoreConfirm={setLocalRestoreConfirm}
              handleLocalRestore={handleLocalRestore}
              gdriveConnected={gdriveConnected}
              setGdriveConnected={setGdriveConnected}
              gdriveEmail={gdriveEmail}
              setGdriveEmail={setGdriveEmail}
              gdriveBackups={gdriveBackups}
              setGdriveBackups={setGdriveBackups}
              gdriveLoading={gdriveLoading}
              gdriveRestoring={gdriveRestoring}
              setGdriveRestoring={setGdriveRestoring}
              gdriveRestoreSteps={gdriveRestoreSteps}
              setGdriveRestoreSteps={setGdriveRestoreSteps}
              gdriveRestoreDone={gdriveRestoreDone}
              setGdriveRestoreDone={setGdriveRestoreDone}
              gdriveSelectedBackup={gdriveSelectedBackup}
              setGdriveSelectedBackup={setGdriveSelectedBackup}
              gdriveTenantId={gdriveTenantId}
              setGdriveTenantId={setGdriveTenantId}
              handleGdriveConnect={handleGdriveConnect}
              handleGdriveDisconnect={handleGdriveDisconnect}
              handleGdriveUpload={handleGdriveUpload}
              handleLoadGdriveBackups={handleLoadGdriveBackups}
              handleGdriveRestore={handleGdriveRestore}
              isSuperAdmin={isSuperAdmin}
              db={db}
            />
          </motion.div>
        )}

        {/* TAB: SAUVEGARDES SYSTÈME (SUPER ADMIN) */}
        {activeSettingsTab === 'backupcenter' && (
          <motion.div key="backupcenter" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <AdminBackupCenter db={db} />
          </motion.div>
        )}

        {/* TAB 4: ISOLATION MULTI-BOUTIQUES */}
        {activeSettingsTab === 'tenants' && (
          <motion.div
            key="tenants"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <TenantSettings
              db={db}
              activeTenantId={activeTenantId}
              handleSwitchTenant={handleSwitchTenant}
            />
          </motion.div>
        )}

        {/* TAB: APPEARANCE */}
        {activeSettingsTab === 'appearance' && (
          <motion.div key="appearance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl">
              <AppearanceSettings />
            </div>
          </motion.div>
        )}

        {/* TAB: SAAS PLANS EDITOR (SUPER ADMIN) */}
        {activeSettingsTab === 'admin-plans' && isSuperAdmin && (
          <motion.div key="admin-plans" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <AdminPlans
              localGlobalSaaSSettings={localGlobalSaaSSettings}
              globalSaaSSettings={globalSaaSSettings}
              localPricingPlans={localPricingPlans}
              pricingPlans={pricingPlans}
              localSaasCurrency={localSaasCurrency}
              tenants={db.tenants}
              setLocalSaasCurrency={setLocalSaasCurrency}
              setLocalPricingPlans={setLocalPricingPlans}
              isSaaSSettingsSaved={isSaaSSettingsSaved}
              isSaaSSettingsSaving={isSaaSSettingsSaving}
              handleSaveAllSaaSSettings={handleSaveAllSaaSSettings}
              handleSavePlanSettings={handleSavePlanSettings}
              handleSaveGlobalPaymentsSettings={handleSaveGlobalPaymentsSettings}
            />
          </motion.div>
        )}

      </AnimatePresence>

      <Modal
        isOpen={showResetPassword}
        onClose={() => { setShowResetPassword(false); setResetPasswordUserId(null); }}
        title="Réinitialiser le mot de passe"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Un lien de réinitialisation sera envoyé par e-mail à <strong className="text-white">{db.users.find(u => u.id === resetPasswordUserId)?.email}</strong>.
            Pour des raisons de sécurité, un administrateur ne choisit plus le mot de passe d'un collaborateur.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setShowResetPassword(false); setResetPasswordUserId(null); }}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl transition"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmPasswordReset}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold rounded-xl transition"
            >
              Envoyer le lien
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTeamUserData !== null}
        title="Révoquer l'accès"
        message={deleteTeamUserData ? `Êtes-vous sûr de vouloir révoquer l'accès de ${deleteTeamUserData.name} ?` : ''}
        confirmLabel="Révoquer"
        variant="warning"
        onConfirm={confirmDeleteTeamUser}
        onCancel={() => setDeleteTeamUserData(null)}
      />
    </div>
  );
}
