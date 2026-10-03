import { useState, useMemo, useCallback, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, UserPlus, Search, X, Check,
  DollarSign, ArrowLeft, Plus, BarChart3, CreditCard,
  Printer, Phone, Mail, MapPin, Building,
  Edit3, Wallet, PiggyBank,
  Settings2, Calendar, FileCheck, Award
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { ConfirmDialog } from './shared/ConfirmDialog';
import {
  AFFILIATE_STATUS_LABELS, COMMISSION_STATUS_LABELS,
  COMMISSION_RULE_TYPES, COMMISSION_PAYMENT_METHODS
} from '../constants';
import type { Affiliate, CommissionRule, CommissionLedgerEntry, CommissionPayment } from '../types';

type CommissionsTab = 'dashboard' | 'affiliates' | 'affiliate-detail' | 'rules' | 'payments';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  to_pay: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  partially_paid: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  recalculated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColors[status] || 'bg-gray-500/10 text-gray-400 border-gray-700'} whitespace-nowrap font-mono uppercase tracking-wider`}>
      {labels[status] || status}
    </span>
  );
}

function formatDate(d?: string) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function formatDateTime(d?: string) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
}

function StatCard({ label, value, subValue, icon: Icon, color, bgGlow }: {
  label: string;
  value: string;
  subValue?: string;
  icon: any;
  color: string;
  bgGlow: string;
}) {
  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 relative overflow-hidden backdrop-blur-sm">
      <div className={`absolute -right-3 -bottom-3 w-20 h-20 rounded-full ${bgGlow} blur-2xl opacity-30 pointer-events-none`} />
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{label}</span>
        <div className={`w-8 h-8 rounded-xl ${bgGlow} flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-black font-mono text-white tracking-tight">{value}</p>
      {subValue && <p className="text-[10px] text-gray-400 mt-1 font-medium">{subValue}</p>}
    </div>
  );
}

// ==========================================
// 1. DASHBOARD VIEW (TABLEAU DE BORD)
// ==========================================
function DashboardView({
  onNavigate,
  onOpenQuickPayment
}: {
  onNavigate: (tab: CommissionsTab, id?: string) => void;
  onOpenQuickPayment: (affiliateId?: string) => void;
}) {
  const { db } = useDB();
  const { activeTenantId, activeTenant } = useApp();

  const formatted = useCallback((v: number) => {
    return formatCurrency(v, activeTenant?.currency || 'GNF');
  }, [activeTenant?.currency]);

  // Derive tenant data
  const tenantAffiliates = useMemo(() => {
    return (db.affiliates || []).filter(a => a.tenantId === activeTenantId);
  }, [db.affiliates, activeTenantId]);

  const tenantLedger = useMemo(() => {
    return (db.commissionLedger || []).filter(e => e.tenantId === activeTenantId);
  }, [db.commissionLedger, activeTenantId]);

  const tenantPayments = useMemo(() => {
    return (db.commissionPayments || []).filter(p => p.tenantId === activeTenantId);
  }, [db.commissionPayments, activeTenantId]);

  // Global KPIs
  const totalEarned = useMemo(() => {
    return tenantLedger.reduce((sum, e) => sum + (e.credit || 0), 0);
  }, [tenantLedger]);

  const totalPaid = useMemo(() => {
    return tenantPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [tenantPayments]);

  const totalBalanceDue = Math.max(0, totalEarned - totalPaid);

  const activeAffiliatesCount = useMemo(() => {
    return tenantAffiliates.filter(a => a.status === 'active').length;
  }, [tenantAffiliates]);

  const totalSalesCommissioned = useMemo(() => {
    const saleIds = new Set<string>();
    tenantLedger.forEach(e => {
      if (e.invoiceId) saleIds.add(e.invoiceId);
      else if (e.reference) saleIds.add(e.reference);
    });
    return saleIds.size;
  }, [tenantLedger]);

  // Affiliate summary table
  const affiliatesSummary = useMemo(() => {
    return tenantAffiliates.map(aff => {
      const affLedger = tenantLedger.filter(e => e.affiliateId === aff.id);
      const affPayments = tenantPayments.filter(p => p.affiliateId === aff.id);
      const affEarned = affLedger.reduce((s, e) => s + (e.credit || 0), 0);
      const affPaid = affPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const affBalance = Math.max(0, affEarned - affPaid);
      const affSales = affLedger.filter(e => e.type === 'commission').length;

      return {
        ...aff,
        earned: affEarned,
        paid: affPaid,
        balance: affBalance,
        salesCount: affSales
      };
    }).sort((a, b) => b.earned - a.earned);
  }, [tenantAffiliates, tenantLedger, tenantPayments]);

  // Monthly stats for chart
  const monthlyStats = useMemo(() => {
    const monthsMap: Record<string, { month: string; comm: number; paid: number }> = {};
    const now = new Date();
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('fr-FR', { month: 'short' });
      monthsMap[key] = { month: label, comm: 0, paid: 0 };
    }

    tenantLedger.forEach(e => {
      if (!e.createdAt || e.credit <= 0) return;
      const key = e.createdAt.slice(0, 7);
      if (monthsMap[key]) {
        monthsMap[key].comm += e.credit;
      }
    });

    tenantPayments.forEach(p => {
      if (!p.createdAt || p.amount <= 0) return;
      const key = p.createdAt.slice(0, 7);
      if (monthsMap[key]) {
        monthsMap[key].paid += p.amount;
      }
    });

    return Object.values(monthsMap);
  }, [tenantLedger, tenantPayments]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const toPay = affiliatesSummary.reduce((sum, a) => sum + a.balance, 0);
    const paid = totalPaid;
    const total = toPay + paid;
    return [
      { label: 'Commissions Réglées', amount: paid, percent: total > 0 ? (paid / total) * 100 : 0, color: 'bg-emerald-500', text: 'text-emerald-400' },
      { label: 'Solde En Attente de Règlement', amount: toPay, percent: total > 0 ? (toPay / total) * 100 : 0, color: 'bg-amber-500', text: 'text-amber-400' }
    ];
  }, [affiliatesSummary, totalPaid]);

  // Recent transactions (both commissions and payments)
  const recentTransactions = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      type: 'credit' | 'payment';
      title: string;
      affiliateName: string;
      amount: number;
      status: string;
    }> = [];

    tenantLedger.slice(0, 15).forEach(e => {
      if (e.type === 'commission' || e.type === 'bonus' || e.credit > 0) {
        const aff = tenantAffiliates.find(a => a.id === e.affiliateId);
        list.push({
          id: e.id,
          date: e.createdAt,
          type: 'credit',
          title: e.description || `Commission ${e.reference || ''}`,
          affiliateName: aff ? `${aff.firstName} ${aff.lastName}` : (e.customerName ? `Réf: ${e.customerName}` : 'Apporteur'),
          amount: e.credit,
          status: e.status
        });
      }
    });

    tenantPayments.slice(0, 15).forEach(p => {
      list.push({
        id: p.id,
        date: p.createdAt,
        type: 'payment',
        title: `Règlement ${p.reference} (${p.method})`,
        affiliateName: p.affiliateName || 'Apporteur',
        amount: p.amount,
        status: 'paid'
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);
  }, [tenantLedger, tenantPayments, tenantAffiliates]);

  return (
    <div className="space-y-5">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-2xl border border-gray-800">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-400" />
            Tableau de Bord des Apporteurs & Commissions
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Suivi en temps réel des performances des partenaires et des décharges de versement
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onNavigate('affiliates')}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Nouvel Apporteur
          </button>
          <button
            onClick={() => onOpenQuickPayment()}
            disabled={totalBalanceDue <= 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5" /> Régler Commission
          </button>
        </div>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Apporteurs Actifs"
          value={String(activeAffiliatesCount)}
          subValue={`${tenantAffiliates.length} apporteur(s) au total`}
          icon={Users}
          color="text-blue-400"
          bgGlow="bg-blue-500/10"
        />
        <StatCard
          label="Commissions Acquises"
          value={formatted(totalEarned)}
          subValue={`${totalSalesCommissioned} vente(s) commissionnée(s)`}
          icon={BarChart3}
          color="text-indigo-400"
          bgGlow="bg-indigo-500/10"
        />
        <StatCard
          label="Commissions Versées"
          value={formatted(totalPaid)}
          subValue={`${tenantPayments.length} règlement(s) effectué(s)`}
          icon={PiggyBank}
          color="text-emerald-400"
          bgGlow="bg-emerald-500/10"
        />
        <StatCard
          label="Reste à Payer (Solde Dû)"
          value={formatted(totalBalanceDue)}
          subValue={totalBalanceDue > 0 ? 'Créances en attente de paiement' : 'Tous les comptes sont à jour'}
          icon={Wallet}
          color={totalBalanceDue > 0 ? "text-amber-400" : "text-gray-400"}
          bgGlow={totalBalanceDue > 0 ? "bg-amber-500/10" : "bg-gray-800/20"}
        />
      </div>

      {/* Charts & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly evolution */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                Évolution des Commissions & Versements
              </h3>
              <p className="text-[10px] text-gray-400">Comparaison sur les 6 derniers mois</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Acquises
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Versées
              </span>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="commColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="paidColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', fontSize: '11px' }}
                  formatter={(val: any) => [formatted(Number(val)), '']}
                />
                <Area type="monotone" dataKey="comm" name="Commissions Acquises" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#commColor)" />
                <Area type="monotone" dataKey="paid" name="Versements Effectués" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#paidColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown & Quick Rules */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-1">
              Répartition des Engagements
            </h3>
            <p className="text-[10px] text-gray-400 mb-4">Ratio payé vs restant dû</p>

            <div className="space-y-4">
              {statusBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-medium">{item.label}</span>
                    <span className={`font-mono font-bold ${item.text}`}>{formatted(item.amount)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${item.percent}%` }} />
                  </div>
                  <div className="text-right text-[10px] font-mono text-gray-500">
                    {item.percent.toFixed(1)}% du total
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Règles & Taux par défaut :</span>
            <button
              onClick={() => onNavigate('rules')}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <Settings2 className="w-3.5 h-3.5" /> Gérer les règles
            </button>
          </div>
        </div>
      </div>

      {/* Top Apporteurs & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Apporteurs Table */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                Classement des Apporteurs d'Affaires
              </h3>
              <p className="text-[10px] text-gray-400">Toutes les commissions et créances par apporteur</p>
            </div>
            <button
              onClick={() => onNavigate('affiliates')}
              className="text-xs font-bold text-blue-400 hover:text-blue-300"
            >
              Voir tous ({tenantAffiliates.length}) →
            </button>
          </div>

          {affiliatesSummary.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-xs">Aucun apporteur enregistré pour le moment.</p>
              <button
                onClick={() => onNavigate('affiliates')}
                className="mt-2 text-xs text-blue-400 font-bold hover:underline"
              >
                + Créer votre premier apporteur
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] text-gray-400 font-mono uppercase">
                    <th className="pb-2 pl-2">Apporteur</th>
                    <th className="pb-2 text-center">Ventes</th>
                    <th className="pb-2 text-right">Commissions</th>
                    <th className="pb-2 text-right">Déjà Versé</th>
                    <th className="pb-2 text-right">Solde Dû</th>
                    <th className="pb-2 pr-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {affiliatesSummary.slice(0, 6).map((aff, i) => (
                    <tr key={aff.id} className="hover:bg-gray-800/40 transition">
                      <td className="py-2.5 pl-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                            {aff.firstName?.[0]}{aff.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate text-xs">{aff.firstName} {aff.lastName}</p>
                            <p className="text-[10px] text-gray-500 truncate">{aff.company || aff.phone || aff.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-center font-mono text-gray-300 text-xs">
                        {aff.salesCount}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-blue-400 text-xs">
                        {formatted(aff.earned)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-emerald-400 text-xs">
                        {formatted(aff.paid)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-amber-400 text-xs">
                        {formatted(aff.balance)}
                      </td>
                      <td className="py-2.5 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {aff.balance > 0 && (
                            <button
                              onClick={() => onOpenQuickPayment(aff.id)}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold transition"
                            >
                              Régler
                            </button>
                          )}
                          <button
                            onClick={() => onNavigate('affiliate-detail', aff.id)}
                            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] font-bold transition"
                          >
                            Fiche
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Transactions Feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col">
          <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider mb-1">
            Dernières Opérations
          </h3>
          <p className="text-[10px] text-gray-400 mb-3">Commissions enregistrées et règlements</p>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[320px] pr-1">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">Aucune opération récente.</p>
            ) : (
              recentTransactions.map(tx => (
                <div
                  key={tx.id}
                  className="p-2.5 rounded-xl bg-gray-950/40 border border-gray-800/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{tx.title}</p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {tx.affiliateName} • {formatDate(tx.date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-bold font-mono ${
                        tx.type === 'payment' ? 'text-emerald-400' : 'text-blue-400'
                      }`}
                    >
                      {tx.type === 'payment' ? '-' : '+'}{formatted(tx.amount)}
                    </span>
                    <span className="block text-[8px] uppercase tracking-wider text-gray-500 font-mono">
                      {tx.type === 'payment' ? 'Versé' : 'Acquis'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. AFFILIATES LIST (GESTION DES APPORTEURS)
// ==========================================
function AffiliatesList({
  onSelect,
  onOpenQuickPayment
}: {
  onSelect: (id: string) => void;
  onOpenQuickPayment: (affiliateId?: string) => void;
}) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId, activeTenant } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    company: '',
    city: '',
    address: '',
    idNumber: '',
    defaultCommissionRate: '',
    payoutMethod: 'especes',
    payoutDetails: '',
    notes: ''
  });

  const formatted = useCallback((v: number) => {
    return formatCurrency(v, activeTenant?.currency || 'GNF');
  }, [activeTenant?.currency]);

  // Compute ledger balances for affiliates
  const affiliatesWithBalances = useMemo(() => {
    const tenantAffs = (db.affiliates || []).filter(a => a.tenantId === activeTenantId);
    const tenantLedger = (db.commissionLedger || []).filter(e => e.tenantId === activeTenantId);
    const tenantPayments = (db.commissionPayments || []).filter(p => p.tenantId === activeTenantId);

    return tenantAffs.map(aff => {
      const earned = tenantLedger.filter(e => e.affiliateId === aff.id).reduce((s, e) => s + (e.credit || 0), 0);
      const paid = tenantPayments.filter(p => p.affiliateId === aff.id).reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, earned - paid);
      return {
        ...aff,
        earned,
        paid,
        balance
      };
    });
  }, [db.affiliates, db.commissionLedger, db.commissionPayments, activeTenantId]);

  const filteredAffiliates = useMemo(() => {
    let list = affiliatesWithBalances;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.phone && a.phone.includes(q)) ||
        (a.code && a.code.toLowerCase().includes(q))
      );
    }
    if (statusFilter) {
      list = list.filter(a => a.status === statusFilter);
    }
    return list;
  }, [affiliatesWithBalances, search, statusFilter]);

  const handleOpenCreate = () => {
    setEditingAffiliate(null);
    setForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      company: '',
      city: '',
      address: '',
      idNumber: '',
      defaultCommissionRate: '',
      payoutMethod: 'especes',
      payoutDetails: '',
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (aff: Affiliate, e: MouseEvent) => {
    e.stopPropagation();
    setEditingAffiliate(aff);
    setForm({
      firstName: aff.firstName || '',
      lastName: aff.lastName || '',
      phone: aff.phone || '',
      email: aff.email || '',
      company: aff.company || '',
      city: aff.city || '',
      address: aff.address || '',
      idNumber: aff.idNumber || '',
      defaultCommissionRate: aff.defaultCommissionRate ? String(aff.defaultCommissionRate) : '',
      payoutMethod: aff.payoutMethod || 'especes',
      payoutDetails: aff.payoutDetails || '',
      notes: aff.notes || ''
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      addNotification('Le prénom et le nom sont obligatoires', 'error');
      return;
    }

    const rateNum = parseFloat(form.defaultCommissionRate);
    const validRate = !isNaN(rateNum) && rateNum >= 0 ? rateNum : undefined;

    if (editingAffiliate) {
      // Update existing
      const updatedAffiliates = (db.affiliates || []).map(a => {
        if (a.id === editingAffiliate.id) {
          return {
            ...a,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            company: form.company.trim() || undefined,
            city: form.city.trim() || undefined,
            address: form.address.trim() || undefined,
            idNumber: form.idNumber.trim() || undefined,
            defaultCommissionRate: validRate,
            payoutMethod: form.payoutMethod,
            payoutDetails: form.payoutDetails.trim() || undefined,
            notes: form.notes.trim() || undefined,
            updatedAt: new Date().toISOString()
          };
        }
        return a;
      });

      handleUpdateDb({ ...db, affiliates: updatedAffiliates });
      addNotification('Fiche apporteur mise à jour avec succès', 'success');
    } else {
      // Create new
      const tenantAffs = (db.affiliates || []).filter(a => a.tenantId === activeTenantId);
      const code = `APP-${String(tenantAffs.length + 1).padStart(3, '0')}`;

      const newAff: Affiliate = {
        id: 'aff_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        code,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        company: form.company.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        idNumber: form.idNumber.trim() || undefined,
        status: 'active',
        defaultCommissionRate: validRate,
        payoutMethod: form.payoutMethod,
        payoutDetails: form.payoutDetails.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      handleUpdateDb({
        ...db,
        affiliates: [...(db.affiliates || []), newAff]
      });
      addNotification(`Apporteur ${newAff.firstName} ${newAff.lastName} créé avec succès`, 'success');
    }

    setShowModal(false);
  };

  const handleToggleStatus = (aff: Affiliate, e: MouseEvent) => {
    e.stopPropagation();
    const newStatus = aff.status === 'active' ? 'suspended' : 'active';
    const updated = (db.affiliates || []).map(a => a.id === aff.id ? { ...a, status: newStatus as any, updatedAt: new Date().toISOString() } : a);
    handleUpdateDb({ ...db, affiliates: updated });
    addNotification(`Statut changé : ${newStatus === 'active' ? 'Actif' : 'Suspendu'}`);
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-2xl border border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Répertoire des Apporteurs d'Affaires
          </h2>
          <p className="text-xs text-gray-400">
            {affiliatesWithBalances.length} apporteur(s) enregistré(s) • Total dû :{' '}
            <span className="font-mono text-amber-400 font-bold">
              {formatted(affiliatesWithBalances.reduce((s, a) => s + a.balance, 0))}
            </span>
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" /> Nouvel Apporteur
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom, téléphone, société ou code..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500"
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="blocked">Bloqués</option>
        </select>
      </div>

      {/* Grid of Affiliates */}
      {filteredAffiliates.length === 0 ? (
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 space-y-3">
          <Users className="w-12 h-12 mx-auto text-gray-600" />
          <p className="text-sm font-medium text-gray-400">Aucun apporteur d'affaires trouvé.</p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Créer un apporteur maintenant
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredAffiliates.map(aff => (
            <motion.div
              key={aff.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelect(aff.id)}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-4 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                      {aff.firstName?.[0]}{aff.lastName?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                          {aff.firstName} {aff.lastName}
                        </h3>
                        <StatusBadge status={aff.status} labels={AFFILIATE_STATUS_LABELS} />
                      </div>
                      <p className="text-[10px] text-gray-500 font-mono">{aff.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => handleOpenEdit(aff, e)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                      title="Modifier"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => handleToggleStatus(aff, e)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition ${
                        aff.status === 'active'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {aff.status === 'active' ? 'Suspendre' : 'Activer'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-gray-400 mb-4 bg-gray-950/40 p-2.5 rounded-xl border border-gray-850">
                  {aff.company && (
                    <div className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-gray-500" />
                      <span className="truncate">{aff.company}</span>
                    </div>
                  )}
                  {aff.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-gray-500" />
                      <span>{aff.phone}</span>
                    </div>
                  )}
                  {aff.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-gray-500" />
                      <span className="truncate">{aff.email}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-800/60 text-[10px]">
                    <span className="text-gray-500">Taux par défaut :</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {aff.defaultCommissionRate ? `${aff.defaultCommissionRate}%` : 'Standard'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom balance summary */}
              <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-500 block uppercase font-mono">Solde Restant Dû</span>
                  <span className="text-sm font-mono font-bold text-amber-400">
                    {formatted(aff.balance)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {aff.balance > 0 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onOpenQuickPayment(aff.id);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <CreditCard className="w-3 h-3" /> Régler
                    </button>
                  )}
                  <button
                    onClick={() => onSelect(aff.id)}
                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-bold transition"
                  >
                    Fiche &gt;
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {editingAffiliate ? "Modifier l'Apporteur d'Affaires" : "Nouvel Apporteur d'Affaires"}
                    </h3>
                    <p className="text-[10px] text-gray-400">
                      Coordonnées, informations fiscales et conditions de commission
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Prénom <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                      placeholder="Ex: Amadou"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Nom <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                      placeholder="Ex: Barry"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Téléphone
                    </label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="620 00 00 00"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="amadou@example.com"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Entreprise / Raison Sociale
                    </label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                      placeholder="Ex: Cabinet Horizon"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      N° Pièce / NIF
                    </label>
                    <input
                      type="text"
                      value={form.idNumber}
                      onChange={e => setForm(p => ({ ...p, idNumber: e.target.value }))}
                      placeholder="N° CNI ou NIF"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Ville
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                      placeholder="Conakry"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
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
                        value={form.defaultCommissionRate}
                        onChange={e => setForm(p => ({ ...p, defaultCommissionRate: e.target.value }))}
                        placeholder="Ex: 5"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">%</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Mode de paiement préféré
                    </label>
                    <select
                      value={form.payoutMethod}
                      onChange={e => setForm(p => ({ ...p, payoutMethod: e.target.value }))}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    >
                      {COMMISSION_PAYMENT_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Détails de versement (Numéro de compte / MoMo)
                    </label>
                    <input
                      type="text"
                      value={form.payoutDetails}
                      onChange={e => setForm(p => ({ ...p, payoutDetails: e.target.value }))}
                      placeholder="Ex: 622 11 22 33"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Observations / Notes internes
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Historique ou accord particulier..."
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> {editingAffiliate ? 'Enregistrer les modifications' : "Créer l'apporteur"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 3. AFFILIATE DETAIL (FICHE & GRAND LIVRE)
// ==========================================
function AffiliateDetail({
  affiliateId,
  onBack,
  onOpenPayment
}: {
  affiliateId: string;
  onBack: () => void;
  onOpenPayment: (affiliateId: string) => void;
}) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId, activeTenant } = useApp();
  const [activeLedgerTab, setActiveLedgerTab] = useState('all');
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    type: 'bonus_exceptional',
    amount: '',
    description: ''
  });

  const formatted = useCallback((v: number) => {
    return formatCurrency(v, activeTenant?.currency || 'GNF');
  }, [activeTenant?.currency]);

  const affiliate = useMemo(() => {
    return (db.affiliates || []).find(a => a.id === affiliateId);
  }, [db.affiliates, affiliateId]);

  const affiliateLedger = useMemo(() => {
    return (db.commissionLedger || []).filter(e => e.affiliateId === affiliateId && e.tenantId === activeTenantId);
  }, [db.commissionLedger, affiliateId, activeTenantId]);

  const affiliatePayments = useMemo(() => {
    return (db.commissionPayments || []).filter(p => p.affiliateId === affiliateId && p.tenantId === activeTenantId);
  }, [db.commissionPayments, affiliateId, activeTenantId]);

  const totalEarned = useMemo(() => {
    return affiliateLedger.reduce((sum, e) => sum + (e.credit || 0), 0);
  }, [affiliateLedger]);

  const totalPaid = useMemo(() => {
    return affiliatePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [affiliatePayments]);

  const balance = Math.max(0, totalEarned - totalPaid);

  const filteredLedger = useMemo(() => {
    if (activeLedgerTab === 'all') return affiliateLedger;
    if (activeLedgerTab === 'credits') return affiliateLedger.filter(e => e.credit > 0);
    if (activeLedgerTab === 'debits') return affiliateLedger.filter(e => e.debit > 0);
    return affiliateLedger.filter(e => e.status === activeLedgerTab);
  }, [affiliateLedger, activeLedgerTab]);

  const handleAddManualEntry = () => {
    const amt = parseFloat(manualForm.amount);
    if (isNaN(amt) || amt <= 0) {
      addNotification('Veuillez saisir un montant valide', 'error');
      return;
    }

    const newEntry: CommissionLedgerEntry = {
      id: 'cml_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      affiliateId,
      type: manualForm.type as any,
      reference: 'AJUST-' + Date.now().toString().slice(-6),
      referenceType: 'manual',
      description: manualForm.description.trim() || 'Ajustement manuel exceptionnel',
      credit: amt,
      debit: 0,
      balance: balance + amt,
      status: 'to_pay',
      tenantId: activeTenantId,
      createdAt: new Date().toISOString()
    };

    handleUpdateDb({
      ...db,
      commissionLedger: [newEntry, ...(db.commissionLedger || [])]
    });

    setShowManualModal(false);
    setManualForm({ type: 'bonus_exceptional', amount: '', description: '' });
    addNotification(`Ajustement de ${formatted(amt)} ajouté au compte de l'apporteur`, 'success');
  };

  const handlePrintStatement = () => {
    window.print();
  };

  if (!affiliate) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-sm">Apporteur introuvable.</p>
        <button onClick={onBack} className="mt-2 text-xs text-blue-400 font-bold hover:underline">
          Retour à la liste
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar with Back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-black text-white shadow-md">
            {affiliate.firstName?.[0]}{affiliate.lastName?.[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">
                {affiliate.firstName} {affiliate.lastName}
              </h2>
              <StatusBadge status={affiliate.status} labels={AFFILIATE_STATUS_LABELS} />
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Code: <span className="text-white">{affiliate.code}</span>
              {affiliate.company ? ` • ${affiliate.company}` : ''}
              {affiliate.phone ? ` • ${affiliate.phone}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrintStatement}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Relevé / Décharge
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Écriture Manuelle
          </button>
          <button
            onClick={() => onOpenPayment(affiliate.id)}
            disabled={balance <= 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" /> Régler Commission
          </button>
        </div>
      </div>

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono block mb-1">
            Total Commissions Acquises
          </span>
          <p className="text-xl font-black font-mono text-blue-400">{formatted(totalEarned)}</p>
          <p className="text-[10px] text-gray-500 mt-1">{affiliateLedger.length} écriture(s) comptabilisée(s)</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono block mb-1">
            Total Déjà Versé (Paiements)
          </span>
          <p className="text-xl font-black font-mono text-emerald-400">{formatted(totalPaid)}</p>
          <p className="text-[10px] text-gray-500 mt-1">{affiliatePayments.length} paiement(s) encaissé(s)</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold font-mono block mb-1">
            Solde Restant Dû (À Payer)
          </span>
          <p className="text-xl font-black font-mono text-amber-400">{formatted(balance)}</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {balance > 0 ? 'Créance exigible en attente de versement' : 'Compte entièrement soldé'}
          </p>
        </div>
      </div>

      {/* Partner Details info banner */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-[10px] text-gray-500 block uppercase font-mono">Taux de Commission</span>
          <span className="font-bold text-white font-mono">
            {affiliate.defaultCommissionRate ? `${affiliate.defaultCommissionRate}%` : 'Standard du catalogue'}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-gray-500 block uppercase font-mono">Mode de Règlement</span>
          <span className="font-bold text-white capitalize">{affiliate.payoutMethod || 'Espèces'}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-500 block uppercase font-mono">Coordonnées de Versement</span>
          <span className="font-bold text-white font-mono truncate block">{affiliate.payoutDetails || 'En caisse'}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-500 block uppercase font-mono">Adhésion</span>
          <span className="font-bold text-white font-mono">{formatDate(affiliate.createdAt)}</span>
        </div>
      </div>

      {/* Grand Livre des Commissions (Ledger) */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
              Grand Livre des Commissions
            </h3>
            <p className="text-[10px] text-gray-400">Historique complet des commissions générées et des versements</p>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {['all', 'credits', 'debits', 'to_pay', 'paid'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveLedgerTab(tab)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-xl transition whitespace-nowrap ${
                  activeLedgerTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'all'
                  ? 'Tout'
                  : tab === 'credits'
                  ? 'Commissions (+)'
                  : tab === 'debits'
                  ? 'Versements (-)'
                  : COMMISSION_STATUS_LABELS[tab] || tab}
              </button>
            ))}
          </div>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileCheck className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            <p className="text-xs">Aucune écriture pour le filtre sélectionné.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-[10px] text-gray-400 font-mono uppercase">
                  <th className="pb-2.5 pl-2">Date & Heure</th>
                  <th className="pb-2.5">Nature / Type</th>
                  <th className="pb-2.5">Réf. Vente / Facture</th>
                  <th className="pb-2.5">Description</th>
                  <th className="pb-2.5 text-right">Crédit (Acquis)</th>
                  <th className="pb-2.5 text-right">Débit (Versé)</th>
                  <th className="pb-2.5 text-center pr-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredLedger.map(e => (
                  <tr key={e.id} className="hover:bg-gray-800/40 transition">
                    <td className="py-2.5 pl-2 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-lg bg-gray-800 text-gray-300 font-mono text-[9px] uppercase">
                        {e.type}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-gray-300 font-bold">
                      {e.reference || e.invoiceNumber || '-'}
                    </td>
                    <td className="py-2.5 text-gray-300 max-w-xs truncate text-[11px]">
                      {e.description || '-'}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-blue-400 text-xs">
                      {e.credit > 0 ? formatted(e.credit) : '-'}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-400 text-xs">
                      {e.debit > 0 ? formatted(e.debit) : '-'}
                    </td>
                    <td className="py-2.5 text-center pr-2">
                      <StatusBadge status={e.status} labels={COMMISSION_STATUS_LABELS} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Ajouter une Écriture Manuelle</h3>
                </div>
                <button
                  onClick={() => setShowManualModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Nature de l'écriture
                  </label>
                  <select
                    value={manualForm.type}
                    onChange={e => setManualForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="bonus_exceptional">Bonus Exceptionnel (+)</option>
                    <option value="adjustment_positive">Ajustement Positif (+)</option>
                    <option value="regularization">Régularisation (+)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Montant ({activeTenant?.currency || 'GNF'}) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={manualForm.amount}
                    onChange={e => setManualForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="Ex: 100000"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Description / Motif
                  </label>
                  <input
                    type="text"
                    value={manualForm.description}
                    onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Ex: Prime de fin d'année, accord exceptionnel"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleAddManualEntry}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20"
                >
                  Valider l'écriture
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 4. PAYOUT MODAL & VOUCHER PRINTING
// ==========================================
function PaymentModal({
  affiliateId,
  onClose,
  onPaymentSuccess
}: {
  affiliateId?: string;
  onClose: () => void;
  onPaymentSuccess: (payment: CommissionPayment) => void;
}) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId, activeTenant, activeUser } = useApp();

  const tenantAffiliates = useMemo(() => {
    return (db.affiliates || []).filter(a => a.tenantId === activeTenantId && a.status === 'active');
  }, [db.affiliates, activeTenantId]);

  const [selectedId, setSelectedId] = useState(affiliateId || tenantAffiliates[0]?.id || '');

  const affiliate = useMemo(() => {
    return tenantAffiliates.find(a => a.id === selectedId);
  }, [tenantAffiliates, selectedId]);

  const affBalance = useMemo(() => {
    if (!selectedId) return 0;
    const earned = (db.commissionLedger || [])
      .filter(e => e.affiliateId === selectedId && e.tenantId === activeTenantId)
      .reduce((s, e) => s + (e.credit || 0), 0);
    const paid = (db.commissionPayments || [])
      .filter(p => p.affiliateId === selectedId && p.tenantId === activeTenantId)
      .reduce((s, p) => s + (p.amount || 0), 0);
    return Math.max(0, earned - paid);
  }, [selectedId, db.commissionLedger, db.commissionPayments, activeTenantId]);

  const [amount, setAmount] = useState(String(affBalance));
  const [method, setMethod] = useState(affiliate?.payoutMethod || 'especes');
  const [notes, setNotes] = useState('');

  // Update amount when affiliate selection changes
  const handleSelectAffiliate = (id: string) => {
    setSelectedId(id);
    const targetAff = tenantAffiliates.find(a => a.id === id);
    const earned = (db.commissionLedger || [])
      .filter(e => e.affiliateId === id && e.tenantId === activeTenantId)
      .reduce((s, e) => s + (e.credit || 0), 0);
    const paid = (db.commissionPayments || [])
      .filter(p => p.affiliateId === id && p.tenantId === activeTenantId)
      .reduce((s, p) => s + (p.amount || 0), 0);
    const bal = Math.max(0, earned - paid);
    setAmount(String(bal));
    if (targetAff?.payoutMethod) setMethod(targetAff.payoutMethod);
  };

  const handleProcessPayment = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      addNotification('Veuillez saisir un montant supérieur à 0', 'error');
      return;
    }
    if (val > affBalance) {
      addNotification('Le montant ne peut pas dépasser le solde restant dû', 'error');
      return;
    }
    if (!affiliate) {
      addNotification('Apporteur non sélectionné', 'error');
      return;
    }

    const paymentRef = 'PAY-' + Date.now().toString().slice(-6);

    const newPayment: CommissionPayment = {
      id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      reference: paymentRef,
      affiliateId: affiliate.id,
      affiliateName: `${affiliate.firstName} ${affiliate.lastName}`,
      amount: val,
      method,
      currency: activeTenant?.currency || 'GNF',
      notes: notes.trim() || undefined,
      ledgerIds: [],
      userId: activeUser?.id,
      userName: activeUser?.name || 'Administrateur',
      tenantId: activeTenantId,
      createdAt: new Date().toISOString()
    };

    const newLedgerEntry: CommissionLedgerEntry = {
      id: 'cml_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      affiliateId: affiliate.id,
      type: 'payment',
      reference: paymentRef,
      referenceType: 'payment',
      description: `Règlement commission (${method}) - ${notes || 'Sans note'}`,
      credit: 0,
      debit: val,
      balance: Math.max(0, affBalance - val),
      status: 'paid',
      paymentId: newPayment.id,
      userId: activeUser?.id,
      userName: activeUser?.name || 'Administrateur',
      tenantId: activeTenantId,
      createdAt: new Date().toISOString()
    };

    // Mark previous "to_pay" entries as "paid" or "partially_paid"
    let remainingToPay = val;
    const updatedLedger = (db.commissionLedger || []).map(entry => {
      if (entry.affiliateId === affiliate.id && entry.status === 'to_pay' && entry.credit > 0 && remainingToPay > 0) {
        if (remainingToPay >= entry.credit) {
          remainingToPay -= entry.credit;
          return { ...entry, status: 'paid' as const };
        } else {
          remainingToPay = 0;
          return { ...entry, status: 'partially_paid' as const };
        }
      }
      return entry;
    });

    handleUpdateDb({
      ...db,
      commissionPayments: [newPayment, ...(db.commissionPayments || [])],
      commissionLedger: [newLedgerEntry, ...updatedLedger]
    });

    addNotification(`Règlement de ${val.toLocaleString()} ${activeTenant?.currency || 'GNF'} enregistré avec succès`, 'success');
    onPaymentSuccess(newPayment);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Règlement de Commission</h3>
              <p className="text-[10px] text-gray-400">Émission du versement et de la décharge</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Sélectionner l'Apporteur
            </label>
            <select
              value={selectedId}
              onChange={e => handleSelectAffiliate(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
            >
              {tenantAffiliates.map(a => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} {a.company ? `(${a.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-gray-950/60 rounded-xl border border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-400">Solde exigible :</span>
            <span className="text-sm font-bold font-mono text-amber-400">
              {affBalance.toLocaleString()} {activeTenant?.currency || 'GNF'}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Montant à Verser
              </label>
              <button
                type="button"
                onClick={() => setAmount(String(affBalance))}
                className="text-[10px] font-bold text-emerald-400 hover:underline"
              >
                Payer la totalité
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={affBalance}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">
                {activeTenant?.currency || 'GNF'}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Mode de Versement
            </label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
            >
              {COMMISSION_PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Observations / N° de transaction
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: N° Chèque, Réf Transaction MoMo, etc."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-xl transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleProcessPayment}
            disabled={affBalance <= 0 || !amount || parseFloat(amount) <= 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Enregistrer & Imprimer Décharge
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Printable Receipt Modal
function ReceiptModal({
  payment,
  onClose
}: {
  payment: CommissionPayment;
  onClose: () => void;
}) {
  const { activeTenant } = useApp();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white text-gray-900 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-black uppercase tracking-wider text-gray-900">
              REÇU DE RÈGLEMENT DE COMMISSION
            </h2>
            <p className="text-[11px] text-gray-500 font-mono">
              Réf: <span className="font-bold text-gray-900">{payment.reference}</span> • {formatDateTime(payment.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Company & Beneficiary */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Émetteur</p>
            <p className="font-bold text-gray-900">{activeTenant?.name || 'Entreprise'}</p>
            <p className="text-gray-600 text-[11px]">{activeTenant?.address || 'Conakry, Guinée'}</p>
            <p className="text-gray-600 text-[11px]">{activeTenant?.phone || ''}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Bénéficiaire</p>
            <p className="font-bold text-gray-900">{payment.affiliateName}</p>
            <p className="text-gray-600 text-[11px]">Apporteur d'Affaires</p>
            <p className="text-gray-600 text-[11px] font-mono">Mode: {payment.method}</p>
          </div>
        </div>

        {/* Payment details box */}
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center space-y-1">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
            Montant Réglé en Décharge
          </span>
          <p className="text-2xl font-black font-mono text-emerald-700">
            {payment.amount.toLocaleString()} {payment.currency || 'GNF'}
          </p>
          {payment.notes && (
            <p className="text-[11px] text-gray-600 italic mt-1">« {payment.notes} »</p>
          )}
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-500 mb-10">
              Pour l'Entreprise (Caissier)
            </p>
            <p className="text-xs font-mono font-medium text-gray-700">{payment.userName || 'Direction'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-500 mb-10">
              Signature & Décharge Bénéficiaire
            </p>
            <p className="text-xs font-mono font-medium text-gray-700">{payment.affiliateName}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl"
          >
            Fermer
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-600/20"
          >
            <Printer className="w-4 h-4" /> Imprimer le Reçu
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ==========================================
// 5. RULES VIEW (RÈGLES DE COMMISSION)
// ==========================================
function RulesView() {
  const { db, handleUpdateDb, handleDeleteRecords, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'percentage' as string,
    value: '',
    minValue: '',
    maxValue: '',
    productId: '',
    category: '',
    campaign: '',
    priority: '0'
  });
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const rules = useMemo(() => (db.commissionRules || []).filter(r => r.tenantId === activeTenantId), [db.commissionRules, activeTenantId]);
  const products = useMemo(() => db.products.filter(p => p.tenantId === activeTenantId), [db.products, activeTenantId]);

  const handleCreate = () => {
    if (!form.name || !form.value) {
      addNotification('Nom et valeur requis', 'error');
      return;
    }

    const valNum = parseFloat(form.value);
    if (isNaN(valNum) || valNum <= 0) {
      addNotification('Veuillez saisir une valeur numérique positive', 'error');
      return;
    }

    const newRule: CommissionRule = {
      id: 'cmr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: form.name.trim(),
      type: form.type as any,
      value: valNum,
      minValue: form.minValue ? parseFloat(form.minValue) : undefined,
      maxValue: form.maxValue ? parseFloat(form.maxValue) : undefined,
      productId: form.productId || undefined,
      category: form.category || undefined,
      campaign: form.campaign || undefined,
      priority: parseInt(form.priority) || 0,
      active: true,
      tenantId: activeTenantId,
      createdAt: new Date().toISOString()
    };

    handleUpdateDb({
      ...db,
      commissionRules: [...(db.commissionRules || []), newRule]
    });

    setShowForm(false);
    setForm({ name: '', type: 'percentage', value: '', minValue: '', maxValue: '', productId: '', category: '', campaign: '', priority: '0' });
    addNotification('Règle de commission enregistrée avec succès', 'success');
  };

  const handleToggle = (rule: CommissionRule) => {
    const updated = (db.commissionRules || []).map(r => r.id === rule.id ? { ...r, active: !r.active } : r);
    handleUpdateDb({ ...db, commissionRules: updated });
    addNotification(`Règle ${rule.active ? 'désactivée' : 'activée'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-gray-900/60 p-4 rounded-2xl border border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-400" />
            Règles & Barèmes de Commission
          </h2>
          <p className="text-xs text-gray-400">
            Configurez les taux automatiques appliqués lors des ventes caisse et factures
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Nouvelle Règle
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase font-mono">Nouvelle Règle de Commission</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nom de la règle (Ex: Standard Cosmétique)" className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500" />
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500">
                {Object.entries(COMMISSION_RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="Valeur (% ou Montant fixe) *" className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-white font-mono outline-none focus:border-blue-500" />
              {form.type === 'fixed_product' && (
                <select value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value }))} className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500">
                  <option value="">Sélectionner un produit</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowForm(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-xl">Annuler</button>
              <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-xl">Enregistrer la règle</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-900/40 rounded-2xl border border-gray-800">
            <Settings2 className="w-10 h-10 mx-auto mb-2 text-gray-700" />
            <p className="text-sm">Aucune règle personnalisée configurée.</p>
            <p className="text-xs text-gray-500 mt-1">Le taux par défaut de chaque apporteur sera utilisé.</p>
          </div>
        ) : rules.map(rule => (
          <div key={rule.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => handleToggle(rule)}
                className={`w-8 h-5 rounded-full transition relative flex-shrink-0 ${rule.active ? 'bg-emerald-600' : 'bg-gray-700'}`}
              >
                <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${rule.active ? 'left-4' : 'left-0.5'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-bold text-white">{rule.name}</h4>
                  <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg text-[9px] font-mono">
                    {COMMISSION_RULE_TYPES[rule.type] || rule.type}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Valeur : <span className="font-mono text-white font-bold">{rule.value}{rule.type === 'percentage' || rule.type === 'margin' ? '%' : ' GNF'}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setDeleteRuleId(rule.id)}
              className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 flex-shrink-0 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={deleteRuleId !== null}
        title="Supprimer la règle"
        message="Voulez-vous vraiment supprimer cette règle de commission ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (!deleteRuleId) return;
          void handleDeleteRecords('commissionRules', [deleteRuleId]);
          addNotification('Règle supprimée');
          setDeleteRuleId(null);
        }}
        onCancel={() => setDeleteRuleId(null)}
      />
    </div>
  );
}

// ==========================================
// 6. PAYMENTS VIEW (HISTORIQUE DES PAIEMENTS)
// ==========================================
function PaymentsView({ onPrintReceipt }: { onPrintReceipt: (p: CommissionPayment) => void }) {
  const { db } = useDB();
  const { activeTenantId, activeTenant } = useApp();
  const [search, setSearch] = useState('');

  const formatted = useCallback((v: number) => {
    return formatCurrency(v, activeTenant?.currency || 'GNF');
  }, [activeTenant?.currency]);

  const payments = useMemo(() => {
    return (db.commissionPayments || []).filter(p => p.tenantId === activeTenantId);
  }, [db.commissionPayments, activeTenantId]);

  const filteredPayments = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(p =>
      (p.reference && p.reference.toLowerCase().includes(q)) ||
      (p.affiliateName && p.affiliateName.toLowerCase().includes(q)) ||
      (p.notes && p.notes.toLowerCase().includes(q))
    );
  }, [payments, search]);

  const totalPaidSum = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-2xl border border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            Historique des Règlements de Commissions
          </h2>
          <p className="text-xs text-gray-400">
            {payments.length} versement(s) effectué(s) • Total payé :{' '}
            <span className="font-mono text-emerald-400 font-bold">{formatted(totalPaidSum)}</span>
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par référence, apporteur ou note..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-950 text-[10px] text-gray-400 uppercase font-mono">
              <tr>
                <th className="p-3">Réf.</th>
                <th className="p-3">Apporteur</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Montant</th>
                <th className="p-3 text-center">Mode</th>
                <th className="p-3">Traité par</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500 text-xs">
                    Aucun paiement enregistré.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-800/30 transition">
                    <td className="p-3 font-mono font-bold text-white text-xs">{p.reference}</td>
                    <td className="p-3 font-medium text-white">{p.affiliateName}</td>
                    <td className="p-3 font-mono text-gray-400 text-[11px]">{formatDateTime(p.createdAt)}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400 text-xs">
                      {formatted(p.amount)}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-lg bg-gray-800 text-gray-300 text-[10px] font-mono capitalize">
                        {p.method}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{p.userName || '-'}</td>
                    <td className="p-3 text-gray-400 max-w-xs truncate text-xs">{p.notes || '-'}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onPrintReceipt(p)}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-[10px] font-bold transition inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" /> Reçu
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMMISSIONS MODULE
// ==========================================
export default function Commissions() {
  const [tab, setTab] = useState<CommissionsTab>('dashboard');
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);

  // Modal for quick payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAffiliateId, setPaymentAffiliateId] = useState<string | undefined>();

  // Modal for printable receipt
  const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<CommissionPayment | null>(null);

  const handleNavigate = (t: CommissionsTab, id?: string) => {
    setTab(t);
    if (id) setSelectedAffiliateId(id);
  };

  const handleOpenQuickPayment = (affId?: string) => {
    setPaymentAffiliateId(affId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (payment: CommissionPayment) => {
    setShowPaymentModal(false);
    setSelectedReceiptPayment(payment);
  };

  return (
    <div className="space-y-4">
      {/* Navigation tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
          { id: 'affiliates', label: "Apporteurs d'affaires", icon: Users },
          { id: 'payments', label: 'Règlements & Paiements', icon: CreditCard },
          { id: 'rules', label: 'Barèmes & Règles', icon: Settings2 },
        ].map(item => {
          const Icon = item.icon;
          const active = tab === item.id || (tab === 'affiliate-detail' && item.id === 'affiliates');
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id as CommissionsTab)}
              className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Tab views */}
      {tab === 'dashboard' && (
        <DashboardView
          onNavigate={handleNavigate}
          onOpenQuickPayment={handleOpenQuickPayment}
        />
      )}

      {tab === 'affiliates' && (
        <AffiliatesList
          onSelect={id => handleNavigate('affiliate-detail', id)}
          onOpenQuickPayment={handleOpenQuickPayment}
        />
      )}

      {tab === 'affiliate-detail' && selectedAffiliateId && (
        <AffiliateDetail
          affiliateId={selectedAffiliateId}
          onBack={() => handleNavigate('affiliates')}
          onOpenPayment={handleOpenQuickPayment}
        />
      )}

      {tab === 'rules' && <RulesView />}

      {tab === 'payments' && (
        <PaymentsView onPrintReceipt={p => setSelectedReceiptPayment(p)} />
      )}

      {/* Global Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <PaymentModal
            affiliateId={paymentAffiliateId}
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={handlePaymentSuccess}
          />
        )}
      </AnimatePresence>

      {/* Printable Receipt Modal */}
      <AnimatePresence>
        {selectedReceiptPayment && (
          <ReceiptModal
            payment={selectedReceiptPayment}
            onClose={() => setSelectedReceiptPayment(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
