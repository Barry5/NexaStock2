import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Handshake, ChevronDown, ChevronUp, Calendar, Check, X, AlertTriangle, DollarSign, Plus, UserPlus } from 'lucide-react';
import { useDB, useApp } from '../../context';
import type { Affiliate } from '../../types';

interface CartItem {
  product: { id: string; name: string; sellPrice: number; buyPrice: number };
  quantity: number;
  negotiatedPrice: number;
  commissionPerUnit?: number;
}

interface Props {
  cart: CartItem[];
  onCartUpdate: (cart: CartItem[]) => void;
  currency?: string;
}

export interface CommissionPayload {
  affiliateId: string;
  commissionItems: { productId: string; productName: string; quantity: number; sellPrice: number; commissionPerUnit: number }[];
  paymentSchedule: string;
  immediatePayment: number;
}

export interface POSCommissionPanelHandle {
  getPayload: () => CommissionPayload | null;
  isActive: () => boolean;
  getAffiliateName: () => string;
}

const SCHEDULE_OPTIONS = [
  { value: 'immediate', label: 'Immédiat', desc: 'Payer maintenant' },
  { value: 'later', label: 'Plus tard', desc: 'Paiement sous 30 jours' },
  { value: 'weekly', label: 'À la semaine', desc: 'Paiement chaque semaine' },
  { value: 'bi_weekly', label: 'À la quinzaine', desc: 'Paiement toutes les 2 semaines' },
  { value: 'end_of_month', label: 'Fin de mois', desc: 'Paiement en fin de mois' },
  { value: 'custom', label: 'Date choisie', desc: 'Choisir une date' },
];

const POSCommissionPanel = forwardRef<POSCommissionPanelHandle, Props>(({ cart, onCartUpdate, currency = 'GNF' }, ref) => {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId } = useApp();

  const [selectedAffiliateId, setSelectedAffiliateId] = useState('');
  const [schedule, setSchedule] = useState('immediate');
  const [customDate, setCustomDate] = useState('');
  const [mode, setMode] = useState<'normal' | 'apporteur'>('normal');
  const [expanded, setExpanded] = useState(true);
  const [bulkPercent, setBulkPercent] = useState('');
  
  // Quick create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newDefaultRate, setNewDefaultRate] = useState('');

  const affiliates = useMemo(() => {
    return (db.affiliates || []).filter(
      (a: Affiliate) => a.tenantId === activeTenantId && a.status !== 'suspended' && a.status !== 'blocked'
    );
  }, [db.affiliates, activeTenantId]);

  const applyBulkPercent = (percentVal?: number) => {
    const pct = percentVal !== undefined ? percentVal : parseFloat(bulkPercent);
    if (isNaN(pct) || pct < 0) return;
    const updated = cart.map(item => ({
      ...item,
      commissionPerUnit: Math.round(item.negotiatedPrice * pct / 100),
    }));
    onCartUpdate(updated);
  };

  const handleQuickCreateAffiliate = () => {
    if (!newFirstName.trim() || !newLastName.trim()) {
      addNotification('Le prénom et le nom sont obligatoires', 'error');
      return;
    }

    const tenantAffiliates = (db.affiliates || []).filter((a: Affiliate) => a.tenantId === activeTenantId);
    const nextIndex = tenantAffiliates.length + 1;
    const code = `APP-${String(nextIndex).padStart(3, '0')}`;
    const rateNum = parseFloat(newDefaultRate);

    const newAffiliate: Affiliate = {
      id: 'aff_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      code,
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      phone: newPhone.trim() || undefined,
      company: newCompany.trim() || undefined,
      status: 'active',
      defaultCommissionRate: !isNaN(rateNum) && rateNum > 0 ? rateNum : undefined,
      tenantId: activeTenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    handleUpdateDb({
      ...db,
      affiliates: [...(db.affiliates || []), newAffiliate],
    });

    setSelectedAffiliateId(newAffiliate.id);
    setShowCreateModal(false);
    setNewFirstName('');
    setNewLastName('');
    setNewPhone('');
    setNewCompany('');
    setNewDefaultRate('');

    if (!isNaN(rateNum) && rateNum > 0) {
      setBulkPercent(String(rateNum));
      applyBulkPercent(rateNum);
    }

    addNotification(`Apporteur ${newAffiliate.firstName} ${newAffiliate.lastName} créé et sélectionné !`, 'success');
  };

  useEffect(() => {
    if (mode === 'normal') {
      setSelectedAffiliateId('');
      const updated = cart.map(item => ({ ...item, commissionPerUnit: undefined }));
      onCartUpdate(updated);
    }
  }, [mode]);

  const updateCommission = (productId: string, value: number) => {
    const updated = cart.map(item =>
      item.product.id === productId ? { ...item, commissionPerUnit: Math.max(0, value) } : item
    );
    onCartUpdate(updated);
  };

  const selectedAffiliate = affiliates.find(a => a.id === selectedAffiliateId);

  // Auto-fill default commission percent when affiliate is selected
  const handleSelectAffiliate = (id: string) => {
    setSelectedAffiliateId(id);
    const aff = affiliates.find(a => a.id === id);
    if (aff?.defaultCommissionRate && aff.defaultCommissionRate > 0) {
      setBulkPercent(String(aff.defaultCommissionRate));
      applyBulkPercent(aff.defaultCommissionRate);
    }
  };

  const commissionSummary = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const item of cart) {
      const comm = item.commissionPerUnit || 0;
      if (comm > 0) {
        total += comm * item.quantity;
        count++;
      }
    }
    return { totalCommission: total, itemCount: count };
  }, [cart]);

  const marginAlerts = useMemo(() => {
    const alerts: string[] = [];
    for (const item of cart) {
      const comm = item.commissionPerUnit || 0;
      if (comm > 0) {
        const margin = item.negotiatedPrice - item.product.buyPrice;
        if (comm > margin) {
          alerts.push(`${item.product.name}: commission ${comm} > marge ${margin}`);
        }
      }
    }
    return alerts;
  }, [cart]);

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      if (mode === 'normal' || !selectedAffiliateId) return null;
      const commissionItems = cart
        .filter(item => (item.commissionPerUnit || 0) > 0)
        .map(item => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          sellPrice: item.negotiatedPrice,
          commissionPerUnit: item.commissionPerUnit || 0,
        }));
      return {
        affiliateId: selectedAffiliateId,
        commissionItems,
        paymentSchedule: schedule,
        immediatePayment: schedule === 'immediate' ? commissionSummary.totalCommission : 0,
      };
    },
    isActive: () => mode === 'apporteur' && !!selectedAffiliateId,
    getAffiliateName: () => selectedAffiliate ? `${selectedAffiliate.firstName} ${selectedAffiliate.lastName}` : '',
  }));

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden transition-all ${mode === 'apporteur' ? 'border-brand-blue/30' : 'border-gray-800'}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-950/30 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Handshake className={`w-4 h-4 ${mode === 'apporteur' ? 'text-brand-blue' : 'text-gray-500'}`} />
          <span className="text-xs font-bold text-gray-300">Apporteur d'affaires</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setMode('normal')}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${mode === 'normal' ? 'bg-gray-700 text-white' : 'bg-gray-850 text-gray-500 hover:text-gray-300'}`}
          ><X className="w-3 h-3 inline mr-1" />Normal</button>
          <button onClick={() => setMode('apporteur')}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${mode === 'apporteur' ? 'bg-brand-blue text-white' : 'bg-gray-850 text-gray-500 hover:text-gray-300'}`}
          ><Check className="w-3 h-3 inline mr-1" />Apporteur</button>
        </div>
      </div>

      {mode === 'apporteur' && (
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Sélectionner l'apporteur
              </label>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" /> + Nouvel apporteur
              </button>
            </div>
            <select value={selectedAffiliateId} onChange={e => handleSelectAffiliate(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2.5 outline-none focus:border-brand-blue"
            >
              <option value="">-- Choisir un apporteur --</option>
              {affiliates.map(a => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} {a.company ? `• ${a.company}` : ''} {a.phone ? `(${a.phone})` : ''}
                </option>
              ))}
            </select>
            {affiliates.length === 0 && (
              <div className="mt-2 p-2 bg-blue-950/30 border border-blue-900/40 rounded-xl flex items-center justify-between">
                <span className="text-[11px] text-gray-300">Aucun apporteur enregistré.</span>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" /> Créer maintenant
                </button>
              </div>
            )}
          </div>

          {selectedAffiliateId && (
            <>
              {/* Per-item commission section */}
              <div>
                <button onClick={() => setExpanded(!expanded)}
                  className="flex items-center justify-between w-full mb-2"
                >
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Commission par article
                  </span>
                  {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                </button>

                {/* Quick bulk % helper */}
                {expanded && cart.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <input type="number" min={0} max={100} step={0.5} value={bulkPercent}
                      placeholder="%"
                      onChange={e => setBulkPercent(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyBulkPercent(); }}
                      className="w-16 bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-[11px] text-white text-right outline-none focus:border-brand-blue font-mono"
                    />
                    <button onClick={applyBulkPercent}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-brand-blue/10 text-blue-400 border border-brand-blue/20 hover:bg-brand-blue/20 transition"
                    >
                      Appliquer % à tous les articles
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      {cart.map(item => {
                        const margin = item.negotiatedPrice - item.product.buyPrice;
                        const comm = item.commissionPerUnit || 0;
                        const totalLineComm = comm * item.quantity;
                        return (
                          <div key={item.product.id}
                            className="flex items-center gap-2 bg-gray-950/50 rounded-xl p-2.5 border border-gray-850"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-gray-200 truncate">{item.product.name}</p>
                              <p className="text-[9px] text-gray-500">
                                {item.quantity} x {item.negotiatedPrice.toLocaleString()} = {(item.quantity * item.negotiatedPrice).toLocaleString()} {currency}
                              </p>
                              {comm > 0 && (
                                <p className="text-[9px] font-bold text-emerald-400 mt-0.5">
                                  Commission: {totalLineComm.toLocaleString()} {currency} ({(comm).toLocaleString()}/pc)
                                </p>
                              )}
                              {comm > margin && (
                                <p className="text-[8px] text-red-400 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Commission dépasse la marge ({margin.toLocaleString()} {currency})
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 w-28">
                              <div className="relative">
                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                <input type="number" min={0}
                                  value={comm || ''} placeholder="0"
                                  onChange={e => updateCommission(item.product.id, Math.max(0, Number(e.target.value)))}
                                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white text-right outline-none focus:border-brand-blue font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Summary */}
              {commissionSummary.totalCommission > 0 && (
                <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-xl p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">Commission totale</span>
                    <span className="text-sm font-bold text-emerald-400">
                      {commissionSummary.totalCommission.toLocaleString()} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-500">Articles commissionnés</span>
                    <span className="text-[10px] text-gray-400">{commissionSummary.itemCount}/{cart.length}</span>
                  </div>
                  {schedule !== 'immediate' && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-500">À payer plus tard</span>
                      <span className="text-[10px] text-amber-400 font-bold">
                        {commissionSummary.totalCommission.toLocaleString()} {currency}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Payment schedule */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Échéance de paiement
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SCHEDULE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setSchedule(opt.value)}
                      className={`text-left px-3 py-2 rounded-xl border text-[10px] transition ${
                        schedule === opt.value
                          ? 'bg-brand-blue/10 border-brand-blue/30 text-blue-400'
                          : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      <span className="font-bold block">{opt.label}</span>
                      <span className="text-[8px] text-gray-500">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                {schedule === 'custom' && (
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    className="mt-2 w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none"
                  />
                )}
              </div>

              {/* Margin alerts */}
              {marginAlerts.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-2.5">
                  {marginAlerts.map((alert, i) => (
                    <p key={i} className="text-[9px] text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {alert}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Quick Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Nouvel Apporteur d'Affaires</h3>
                    <p className="text-[10px] text-gray-400">Création rapide sans quitter la caisse</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Prénom <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newFirstName}
                      onChange={e => setNewFirstName(e.target.value)}
                      placeholder="Ex: Mamadou"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Nom <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newLastName}
                      onChange={e => setNewLastName(e.target.value)}
                      placeholder="Ex: Diallo"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Téléphone
                    </label>
                    <input
                      type="text"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="620 00 00 00"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Société / Entreprise
                    </label>
                    <input
                      type="text"
                      value={newCompany}
                      onChange={e => setNewCompany(e.target.value)}
                      placeholder="Ex: Agence Immo"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Taux de commission par défaut (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={newDefaultRate}
                      onChange={e => setNewDefaultRate(e.target.value)}
                      placeholder="Ex: 5"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">%</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Ce taux sera automatiquement appliqué aux articles commissionnés.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleQuickCreateAffiliate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Enregistrer & Sélectionner
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

POSCommissionPanel.displayName = 'POSCommissionPanel';
export default POSCommissionPanel;
