import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User as UserIcon, Mail, Shield, Lock, Store, 
  Check, Save, Eye, EyeOff, Sparkles, Key, AlertCircle,
  Building2, CheckCircle2
} from 'lucide-react';
import { useDB, useApp } from '../context';
import { changeOwnPassword, authErrorMessage, MIN_PASSWORD_LENGTH } from '../lib/authService';
import type { UserRole } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-purple-600 to-pink-600',
  'from-emerald-600 to-teal-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-red-600',
  'from-cyan-600 to-blue-600',
];

const ROLE_LABELS: Record<UserRole, { label: string; color: string; desc: string }> = {
  superadmin: {
    label: 'Super Administrateur',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    desc: 'Accès racine complet, gestion multi-boutiques, configuration SaaS et Firestore.'
  },
  owner: {
    label: 'Propriétaire / Fondateur',
    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    desc: 'Propriétaire de l\'organisation, gestion de l\'abonnement et des accès administratifs.'
  },
  admin: {
    label: 'Administrateur',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    desc: 'Gestion complète de la boutique, stocks, utilisateurs, finances et rapports.'
  },
  gerant: {
    label: 'Gérant / Manager',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    desc: 'Supervision des opérations quotidiennes, stocks, réapprovisionnement et encaissements.'
  },
  vendeur: {
    label: 'Vendeur / Caissier',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    desc: 'Point de Vente (POS), enregistrement des ventes, devis et facturation comptoir.'
  },
  comptable: {
    label: 'Comptable',
    color: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    desc: 'Accès aux finances, rapports de trésorerie, factures et suivi des dépenses.'
  },
  stock_manager: {
    label: 'Gestionnaire de Stock',
    color: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    desc: 'Entrées/sorties d\'inventaire, réapprovisionnement IA, alertes ruptures et fournisseurs.'
  },
  lecture_seule: {
    label: 'Lecture Seule',
    color: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    desc: 'Consultation des tableaux de bord sans droit de modification.'
  }
};

export default function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeUser, activeTenant, setActiveUserId, setIsLoggedIn, setActiveTenantId } = useApp();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [name, setName] = useState(activeUser?.name || '');
  const [email, setEmail] = useState(activeUser?.email || '');
  const [selectedAvatar, setSelectedAvatar] = useState(activeUser?.avatar || AVATAR_COLORS[0]);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync state if activeUser changes
  React.useEffect(() => {
    if (activeUser) {
      setName(activeUser.name || '');
      setEmail(activeUser.email || '');
      setSelectedAvatar(activeUser.avatar || AVATAR_COLORS[0]);
    }
  }, [activeUser]);

  if (!isOpen || !activeUser) return null;

  const roleInfo = ROLE_LABELS[activeUser.role] || {
    label: activeUser.role,
    color: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    desc: 'Utilisateur NexaStock'
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Le nom complet est obligatoire.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Veuillez saisir une adresse email valide.');
      return;
    }

    // Check email uniqueness if changed
    const emailConflict = db.users.some(
      u => u.id !== activeUser.id && u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (emailConflict) {
      setError('Cette adresse email est déjà utilisée par un autre compte.');
      return;
    }

    setSaving(true);
    try {
      const updatedUsers = db.users.map(u => {
        if (u.id === activeUser.id) {
          return {
            ...u,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            avatar: selectedAvatar
          };
        }
        return u;
      });

      await handleUpdateDb({ ...db, users: updatedUsers });
      addNotification('Profil mis à jour avec succès !', 'success');
      onClose();
    } catch {
      setError('Erreur lors de la sauvegarde du profil.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Saisissez votre mot de passe actuel.');
      return;
    }

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Le nouveau mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSaving(true);
    try {
      // SEC-02 : vérification du mot de passe actuel et changement par Firebase Auth.
      await changeOwnPassword(newPassword, currentPassword);
      if (activeUser.firstLoginReset) {
        await handleUpdateDb({ ...db, users: db.users.map(u => u.id === activeUser.id ? { ...u, firstLoginReset: false } : u) });
      }
      addNotification('Mot de passe modifié avec succès !', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (n.slice(0, 2) || 'NX').toUpperCase();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-gray-900 border border-gray-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
        >
          {/* Header Card */}
          <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 relative">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${selectedAvatar} flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-500/20 border border-white/20`}>
                {getInitials(name || activeUser.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white truncate">{name || activeUser.name}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{email || activeUser.email}</p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                  <Store className="w-3.5 h-3.5 text-blue-400" />
                  <span>{activeTenant?.name || 'Organisation Racine'}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" /> Compte actif
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => { setActiveTab('profile'); setError(null); }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === 'profile'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                Informations Profil
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('security'); setError(null); }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === 'security'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Mot de Passe & Sécurité
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {activeTab === 'profile' ? (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Nom complet
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Barry Hassim"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Adresse Email de connexion
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@entreprise.com"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Thème d'Avatar & Couleur
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVATAR_COLORS.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedAvatar(c)}
                        className={`h-10 rounded-xl bg-gradient-to-br ${c} flex items-center justify-center border-2 transition ${
                          selectedAvatar === c ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        {selectedAvatar === c && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role Description Card */}
                <div className="p-4 rounded-2xl bg-gray-950 border border-gray-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span>Rôle attribué : {roleInfo.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {roleInfo.desc}
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Enregistrement...' : 'Enregistrer le Profil'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="p-3.5 bg-blue-950/30 border border-blue-800/40 rounded-2xl text-xs text-blue-300 flex items-start gap-2.5">
                  <Key className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Vous pouvez modifier votre mot de passe pour sécuriser l'accès à votre espace NexaStock.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Mot de passe actuel (si configuré)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Saisissez votre mot de passe actuel"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
                    >
                      {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 4 caractères"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-gray-400 uppercase mb-1.5">
                    Confirmer le nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Répétez le nouveau mot de passe"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs text-gray-950 font-bold transition flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {saving ? 'Mise à jour...' : 'Mettre à jour le Mot de Passe'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
