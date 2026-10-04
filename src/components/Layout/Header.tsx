import React, { useState } from 'react';
import { useDB, useApp } from '../../context';
import { Cloud, CloudOff, RefreshCw, User as UserIcon, LogOut, ChevronDown, Check, Shield, Building2 } from 'lucide-react';
import UserProfileModal from '../UserProfileModal';
import { SyncStatusPanel } from '../sync/SyncStatusPanel';

export function Header() {
  const { db, isSyncing, syncError, connectionState, outboxStats, handleSyncFromServer, addNotification } = useDB();
  const { activeTenant, activeUser, activeTenantId, handleSwitchTenant, currentTab, logout } = useApp();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

  const isSuperAdmin = activeUser?.role === 'superadmin';

  // OBS-02 : le résultat affiché est celui de la file réelle, plus un « succès » systématique.
  const handleManualSync = async () => {
    try {
      addNotification('Envoi des modifications en attente...');
      const res = await handleSyncFromServer();
      if (res.dead > 0) {
        addNotification(`${res.dead} opération(s) en échec : voir la console de synchronisation.`, 'error');
      } else if (!res.acknowledged || res.pending > 0) {
        addNotification(`${res.pending} opération(s) en attente du serveur (connexion lente ou absente).`, 'warning');
      } else {
        addNotification('Toutes les modifications sont confirmées par le serveur.', 'success');
      }
    } catch {
      addNotification('Erreur lors de la synchronisation.', 'error');
    }
  };

  const handleLogout = () => {
    void logout();
  };

  const getInitials = (n?: string) => {
    if (!n) return 'NX';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (n.slice(0, 2) || 'NX').toUpperCase();
  };

  return (
    <>
      <header className="hidden lg:flex h-16 border-b border-gray-800 px-6 items-center justify-between bg-gray-900 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          {/* Boutique active : Seul le super-admin peut basculer d'entreprise */}
          <div className="relative">
            {isSuperAdmin ? (
              <>
                <button
                  onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 text-left text-xs transition"
                  title="Super-admin : basculer vers un locataire"
                >
                  <Building2 className="w-3.5 h-3.5 text-red-400" />
                  <span className="font-bold text-white uppercase">{activeTenant?.name || 'Organisation'}</span>
                  <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-mono font-bold">SUPERADMIN</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {tenantDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-2 z-50">
                    <div className="px-3 py-1 text-[10px] font-mono text-gray-400 uppercase">Superadmin - Changer de boutique</div>
                    {db.tenants.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          handleSwitchTenant(t.id);
                          setTenantDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left ${
                          t.id === activeTenantId ? 'bg-blue-600/20 text-blue-300 font-bold' : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        <span>{t.name}</span>
                        {t.id === activeTenantId && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-left text-xs">
                <Building2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold text-white uppercase leading-tight">{activeTenant?.name || 'Mon Entreprise'}</span>
                  <span className="text-[9px] font-mono text-gray-400 leading-tight">Entreprise liée (Compte unique)</span>
                </div>
              </div>
            )}
          </div>

          <span className="text-gray-700">|</span>
          <span className="text-xs font-mono text-gray-400 uppercase">{currentTab}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Phase 4 : état réel de la synchronisation (cliquable) */}
          <div className="flex items-center gap-2 bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-800 text-xs font-mono">
            <button
              onClick={() => setSyncPanelOpen(true)}
              className="flex items-center gap-2"
              title="Afficher l'état de la synchronisation"
            >
              <span className={`w-2 h-2 rounded-full ${connectionState === 'online' ? 'bg-emerald-400' : connectionState === 'degraded' ? 'bg-amber-400 animate-pulse' : 'bg-amber-400'}`} />
              {isSyncing ? (
                <span className="text-blue-400 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Envoi…
                </span>
              ) : connectionState === 'offline' ? (
                <span className="text-amber-400 flex items-center gap-1"><CloudOff className="w-3 h-3" /> Hors ligne</span>
              ) : connectionState === 'degraded' ? (
                <span className="text-amber-400 flex items-center gap-1"><CloudOff className="w-3 h-3" /> Dégradé</span>
              ) : syncError ? (
                <span className="text-red-400 flex items-center gap-1"><CloudOff className="w-3 h-3" /> Erreur</span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1"><Cloud className="w-3 h-3" /> En ligne</span>
              )}
              {outboxStats.pending + outboxStats.sent > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded" title="Modifications non confirmées par le serveur">
                  {outboxStats.pending + outboxStats.sent}
                </span>
              )}
              {outboxStats.dead > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 rounded" title="Opérations en file morte">
                  {outboxStats.dead} !
                </span>
              )}
            </button>
            <button onClick={handleManualSync} title="Synchroniser" className="text-gray-500 hover:text-white transition">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* User profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 text-xs text-white transition group"
            >
              <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${activeUser?.avatar || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-[10px] font-black text-white shadow-sm`}>
                {getInitials(activeUser?.name)}
              </div>
              <div className="text-left">
                <span className="font-bold block leading-tight">{activeUser?.name || 'Utilisateur'}</span>
                <span className="text-[9.5px] text-gray-400 uppercase font-mono block leading-tight">{activeUser?.role}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
                <div className="px-3 py-2 border-b border-gray-800/80 mb-1">
                  <p className="text-xs font-bold text-white truncate">{activeUser?.name}</p>
                  <p className="text-[10px] font-mono text-gray-400 truncate">{activeUser?.email}</p>
                </div>
                
                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-200 hover:bg-gray-800 hover:text-white font-medium transition"
                >
                  <UserIcon className="w-4 h-4 text-blue-400" />
                  <span>Mon Profil & Sécurité</span>
                </button>

                <div className="h-px bg-gray-800/60 my-1" />

                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 font-bold transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Se déconnecter</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* User Profile Modal */}
      <SyncStatusPanel isOpen={syncPanelOpen} onClose={() => setSyncPanelOpen(false)} />
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </>
  );
}
export default Header;
