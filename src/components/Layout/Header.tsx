import React, { useState } from 'react';
import { useDB, useApp } from '../../context';
import { Cloud, CloudOff, RefreshCw, Bell, User as UserIcon, LogOut, ChevronDown, Check } from 'lucide-react';

export function Header() {
  const { db, isSyncing, syncError, isOnline, notifications, handleUpdateDb, addNotification } = useDB();
  const { activeTenant, activeUser, activeTenantId, handleSwitchTenant, currentTab, setIsLoggedIn, setActiveUserId, setActiveTenantId } = useApp();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);

  const handleManualSync = async () => {
    try {
      addNotification('Synchronisation Firebase Firestore en cours...');
      await handleUpdateDb(db);
      addNotification('Base de données synchronisée avec le Cloud !');
    } catch {
      addNotification('Erreur lors de la synchronisation.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setActiveUserId('');
    setActiveTenantId('');
    localStorage.removeItem('nexastock_session');
    localStorage.removeItem('nexastock_token');
  };

  return (
    <header className="hidden lg:flex h-16 border-b border-gray-800 px-6 items-center justify-between bg-gray-900 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Boutique active */}
        <div className="relative">
          <button
            onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 text-left text-xs"
          >
            <span className="font-bold text-white uppercase">{activeTenant?.name || 'Organisation'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {tenantDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-2 z-50">
              <div className="px-3 py-1 text-[10px] font-mono text-gray-400 uppercase">Changer de boutique</div>
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
        </div>

        <span className="text-gray-700">|</span>
        <span className="text-xs font-mono text-gray-400 uppercase">{currentTab}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Firebase Sync status */}
        <div className="flex items-center gap-2 bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-800 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {isSyncing ? (
            <span className="text-blue-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Sync...
            </span>
          ) : syncError ? (
            <span className="text-red-400 flex items-center gap-1">
              <CloudOff className="w-3 h-3" /> Offline
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Cloud className="w-3 h-3" /> Firestore
            </span>
          )}
          <button onClick={handleManualSync} title="Synchroniser" className="text-gray-500 hover:text-white">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {/* User profile */}
        <div className="relative">
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 text-xs text-white"
          >
            <span className="font-bold">{activeUser?.name || 'Utilisateur'}</span>
            <span className="text-[10px] text-gray-400 uppercase">({activeUser?.role})</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-2 z-50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 font-bold"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
export default Header;
