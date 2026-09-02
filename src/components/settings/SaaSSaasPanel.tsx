import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Copy,
  CheckCircle2,
  Phone,
  Building2,
  FileText,
  Info
} from 'lucide-react';
import { futurePaymentProviders } from '../../lib/subscriptionUtils';
import PricingPlanGrid from '../pricing/PricingPlanGrid';
import type { PricingPlan } from '../../types';

interface SaaSSaasPanelProps {
  tenantPlanStatus: any;
  remainingDays: any;
  activeTenant: any;
  pricingPlans: any[];
  paymentTargetPlan: any;
  setPaymentTargetPlan: (p: any) => void;
  payAmount: number;
  setPayAmount: (v: number) => void;
  setIsPaymentFormOpen: (v: boolean) => void;
  handleSubmitPaymentRequest: (e: React.FormEvent) => void;
  globalSaaSSettings: any;
  payMethod: string;
  setPayMethod: (v: string) => void;
  payReference: string;
  setPayReference: (v: string) => void;
  payNumTransaction: string;
  setPayNumTransaction: (v: string) => void;
  payComment: string;
  setPayComment: (v: string) => void;
  payReceiptSim: string;
  setPayReceiptSim: (v: string) => void;
  paymentSuccess: boolean;
  tenantPayments: any[];
  isSyncing: boolean;
  handleSyncFromServer: () => void;
  db: any;
  isAdmin?: boolean;
  onOpenAdminPlans?: () => void;
}

export default function SaaSSaasPanel({
  tenantPlanStatus,
  remainingDays,
  activeTenant,
  pricingPlans,
  paymentTargetPlan,
  setPaymentTargetPlan,
  payAmount,
  setPayAmount,
  setIsPaymentFormOpen,
  handleSubmitPaymentRequest,
  globalSaaSSettings,
  payMethod,
  setPayMethod,
  payReference,
  setPayReference,
  payNumTransaction,
  setPayNumTransaction,
  payComment,
  setPayComment,
  payReceiptSim,
  setPayReceiptSim,
  paymentSuccess,
  tenantPayments,
  isSyncing,
  handleSyncFromServer,
  db,
  isAdmin = false,
  onOpenAdminPlans,
}: SaaSSaasPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const paymentFormRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSelectPlan = (plan: PricingPlan, amount: number) => {
    setPaymentTargetPlan(plan);
    setPayAmount(amount);
    setIsPaymentFormOpen(true);
    setTimeout(() => {
      paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="space-y-8">
      {/* 1. Subscription Header Summary Card */}
      {tenantPlanStatus && (
        <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          {/* Background lighting ornament */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-10 -mr-16 -mt-16 bg-blue-500 pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
                Statut de l'Abonnement Actif
              </span>
              
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  Plan {tenantPlanStatus.planName}
                </h2>
                
                {/* Status badge */}
                <span className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg border uppercase tracking-wide flex items-center gap-1.5 ${
                  tenantPlanStatus.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : tenantPlanStatus.status === 'TRIAL'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : tenantPlanStatus.status === 'PENDING'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : tenantPlanStatus.status === 'EXPIRED'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
                }`}>
                  {tenantPlanStatus.status === 'TRIAL' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                  {tenantPlanStatus.status === 'ACTIVE' && <Check className="w-3.5 h-3.5" />}
                  {tenantPlanStatus.status === 'PENDING' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {tenantPlanStatus.status === 'EXPIRED' && <AlertCircle className="w-3.5 h-3.5 animate-bounce" />}
                  {tenantPlanStatus.status === 'TRIAL' ? 'Essai Gratuit' : tenantPlanStatus.status}
                </span>
              </div>

              <p className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                {remainingDays.text}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => {
                  const target = pricingPlans.find(p => p.id === 'plan-standard') || pricingPlans[1] || pricingPlans[0];
                  if (target) handleSelectPlan(target, target.price);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <CreditCard className="w-4 h-4" />
                Renouveler ce Forfait
              </button>
              <button
                onClick={() => {
                  const premium = pricingPlans.find(p => p.id === 'plan-premium') || pricingPlans[2] || pricingPlans[0];
                  if (premium) handleSelectPlan(premium, premium.price);
                }}
                className="bg-purple-600/15 border border-purple-500/30 hover:bg-purple-600/25 text-purple-300 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Changer d'Offre
              </button>
            </div>
          </div>

          {/* Status Alerts */}
          {activeTenant?.subscriptionStatus === 'TRIAL' && (
            <div className="mt-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-200 font-medium leading-relaxed">
                Compte en période d'essai gratuit. Il vous reste <strong className="text-white font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded">{remainingDays.days} jours</strong> pour explorer l'ensemble de l'écosystème avant la fin de l'accès illimité.
              </p>
            </div>
          )}

          {activeTenant?.subscriptionStatus === 'EXPIRED' && (
            <div className="mt-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-200 font-medium leading-relaxed">
                <strong>Votre abonnement a expiré.</strong> Choisissez un forfait ci-dessous pour renouveler votre accès sans interruption de service.
              </p>
            </div>
          )}
          
          {activeTenant?.subscriptionStatus === 'PENDING' && (
            <div className="mt-5 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-xs text-blue-200 font-medium leading-relaxed">
                <strong>Déclaration de paiement reçue !</strong> Votre dossier de transaction est en cours de vérification par notre équipe d'administration.
              </p>
            </div>
          )}

          {/* 2. Usage Meters Block */}
          <div className="mt-6 pt-6 border-t border-gray-850 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono">
              Consommation des ressources incluses dans votre forfait
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Products meter */}
              <div className="bg-gray-900 p-3.5 rounded-xl border border-gray-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 font-semibold">Articles Catalogue</span>
                  <span className="font-mono text-gray-200 font-bold">
                    {tenantPlanStatus.products.current} / {tenantPlanStatus.products.max >= 9999 ? 'Illimité' : tenantPlanStatus.products.max}
                  </span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.products.isLimitReached ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, (tenantPlanStatus.products.current / (tenantPlanStatus.products.max || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Sales POS meter */}
              <div className="bg-gray-900 p-3.5 rounded-xl border border-gray-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 font-semibold">Ventes & Encaissements</span>
                  <span className="font-mono text-gray-200 font-bold">
                    {tenantPlanStatus.sales.current} / {tenantPlanStatus.sales.max >= 9999 ? 'Illimité' : tenantPlanStatus.sales.max}
                  </span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.sales.isLimitReached ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (tenantPlanStatus.sales.current / (tenantPlanStatus.sales.max || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Users count meter */}
              <div className="bg-gray-900 p-3.5 rounded-xl border border-gray-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 font-semibold">Utilisateurs / Caissiers</span>
                  <span className="font-mono text-gray-200 font-bold">
                    {tenantPlanStatus.users.current} / {tenantPlanStatus.users.max >= 99 ? 'Illimité' : tenantPlanStatus.users.max}
                  </span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.users.isLimitReached ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(100, (tenantPlanStatus.users.current / (tenantPlanStatus.users.max || 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Warehouses/Boutiques count */}
              <div className="bg-gray-900 p-3.5 rounded-xl border border-gray-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 font-semibold">Boutiques / Dépôts</span>
                  <span className="font-mono text-gray-200 font-bold">
                    {tenantPlanStatus.warehouses.current} / {tenantPlanStatus.warehouses.max >= 10 ? 'Illimité' : tenantPlanStatus.warehouses.max}
                  </span>
                </div>
                <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.warehouses.isLimitReached ? 'bg-red-500' : 'bg-cyan-500'}`}
                    style={{ width: `${Math.min(100, (tenantPlanStatus.warehouses.current / (tenantPlanStatus.warehouses.max || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. THE MAIN PROFESSIONAL PRICING PLANS GRID */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
        <PricingPlanGrid
          pricingPlans={pricingPlans}
          activeTenant={activeTenant}
          paymentTargetPlan={paymentTargetPlan}
          onSelectPlan={handleSelectPlan}
          currency={db.saasCurrency || 'EUR'}
          isAdmin={isAdmin}
          onOpenAdminPlans={onOpenAdminPlans}
        />
      </div>

      {/* 3. PAYMENT DECLARATION & RECEIPTS SECTION */}
      <div ref={paymentFormRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Offline Payment Submit Form */}
        <div className="lg:col-span-7 space-y-6">
          {paymentTargetPlan ? (
            <div className="bg-gray-950 border border-purple-500/30 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="p-5 border-b border-gray-850 bg-gradient-to-r from-purple-950/30 to-gray-950 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase text-white font-sans">
                      Déclarer un Règlement Hors-Plateforme
                    </h4>
                    <p className="text-xs text-gray-400">
                      Souscription au forfait : <strong className="text-purple-300 font-bold">{paymentTargetPlan.name}</strong> ({payAmount} {paymentTargetPlan.currency || 'EUR'})
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Instructions with Copy Buttons */}
              <div className="p-5 space-y-5">
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl space-y-3 text-xs">
                  <p className="font-bold text-purple-400 uppercase tracking-wide font-mono text-[10px] flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Coordonnées Officielles de Règlement :
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {/* Orange Money */}
                    <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-1">
                      <span className="font-bold text-orange-400 font-mono text-[11px] block">
                        🍊 Orange Money :
                      </span>
                      <div className="flex items-center justify-between">
                        <p className="text-white font-mono text-xs font-bold">
                          {globalSaaSSettings.orangeMoneyNumber || '+224 620 00 00 00'}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(globalSaaSSettings.orangeMoneyNumber || '+224 620 00 00 00', 'om')}
                          className="p-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition"
                          title="Copier le numéro"
                        >
                          {copiedKey === 'om' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500">{globalSaaSSettings.orangeMoneyName || 'NexaStock SaaS'}</p>
                    </div>

                    {/* MTN / Wave */}
                    <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-1">
                      <span className="font-bold text-yellow-400 font-mono text-[11px] block">
                        💛 MTN / Mobile Money :
                      </span>
                      <div className="flex items-center justify-between">
                        <p className="text-white font-mono text-xs font-bold">
                          {globalSaaSSettings.mobileMoneyNumber || '+224 660 11 22 33'}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(globalSaaSSettings.mobileMoneyNumber || '+224 660 11 22 33', 'mtn')}
                          className="p-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition"
                          title="Copier le numéro"
                        >
                          {copiedKey === 'mtn' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500">{globalSaaSSettings.mobileMoneyName || 'NexaStock Services'}</p>
                    </div>

                    {/* Bank / RIB */}
                    <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-1">
                      <span className="font-bold text-blue-400 font-mono text-[11px] block">
                        🏦 Virement / RIB :
                      </span>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-white font-mono line-clamp-2">
                          {globalSaaSSettings.bankDetails || 'Banque: Société Générale / IBAN disponible'}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(globalSaaSSettings.bankDetails || 'NexaStock IBAN', 'rib')}
                          className="p-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition flex-shrink-0 ml-1"
                          title="Copier les coordonnées"
                        >
                          {copiedKey === 'rib' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Inputs */}
                <form onSubmit={handleSubmitPaymentRequest} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Moyen de règlement *</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3.5 py-2.5 text-white"
                      >
                        <option value="Orange Money">Orange Money</option>
                        <option value="MTN Mobile Money">MTN Mobile Money</option>
                        <option value="Wave">Wave</option>
                        <option value="Virement bancaire">Virement bancaire</option>
                        <option value="Espèces (Remise physique)">Espèces</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Montant payé ({paymentTargetPlan.currency || 'EUR'}) *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Référence du reçu / Transaction *</label>
                      <input
                        type="text"
                        required
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                        placeholder="ex: OM-8374928193"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro émetteur / Téléphone de paiement *</label>
                      <input
                        type="text"
                        required
                        value={payNumTransaction}
                        onChange={(e) => setPayNumTransaction(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                        placeholder="ex: +224 621 00 11 22"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Commentaire ou Précision</label>
                    <textarea
                      value={payComment}
                      onChange={(e) => setPayComment(e.target.value)}
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3.5 py-2 text-white"
                      placeholder="Indiquez par exemple le nom du payeur ou une mention utile..."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-850">
                    {paymentSuccess ? (
                      <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Reçu soumis avec succès ! Dossier EN ATTENTE DE VALIDATION.
                      </span>
                    ) : (
                      <div className="text-[10px] text-gray-500 font-mono leading-snug">
                        L'activation du forfait est instantanée après validation comptable.
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={paymentSuccess}
                      className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Envoyer la Déclaration
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 text-center space-y-3 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-white font-sans">Sélectionnez une Offre ci-dessus</h4>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Cliquez sur <strong className="text-blue-400">"Choisir ce Forfait"</strong> ou <strong className="text-emerald-400">"Renouveler"</strong> sur n'importe quel plan pour afficher le formulaire de versement sécurisé.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Submitted receipts history & Payment Provider Architecture */}
        <div className="lg:col-span-5 space-y-6">
          {/* Receipts history */}
          <div className="bg-gray-950 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              Historique des Déclarations de Règlement
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {tenantPayments.length === 0 ? (
                <p className="text-xs text-gray-500 italic text-center py-6">
                  Aucune déclaration de paiement soumise pour cette entreprise.
                </p>
              ) : (
                tenantPayments.map(p => (
                  <div key={p.id} className="p-3.5 rounded-xl bg-gray-900 border border-gray-800 space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-black text-gray-200">Plan {p.planName}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {new Date(p.createdAt).toLocaleDateString('fr-FR')} - {p.paymentMethod}
                        </p>
                      </div>

                      <span className={`px-2 py-0.5 text-[9px] font-black font-mono rounded uppercase border tracking-wide ${
                        p.status === 'APPROVED'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : p.status === 'PENDING'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        {p.status === 'APPROVED' ? 'Validé' : p.status === 'PENDING' ? 'En Attente' : 'Rejeté'}
                      </span>
                    </div>

                    <div className="flex justify-between text-[11px] font-mono border-t border-gray-800 pt-2 font-bold">
                      <span className="text-gray-400">Ref: {p.reference}</span>
                      <span className="text-white">{p.amount} {p.currency || 'EUR'}</span>
                    </div>

                    {p.adminComment && (
                      <div className="bg-gray-950 p-2 rounded-lg border border-gray-850 text-[10px] text-gray-400 leading-normal">
                        <strong className="text-gray-300 font-bold">Retour administration :</strong> {p.adminComment}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Payment providers preview */}
          <div className="bg-gray-950 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex justify-between items-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                Passerelles de Paiement Automatisées
              </h3>
              <span className="text-[9px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded uppercase">
                Module API
              </span>
            </div>
            
            <p className="text-xs text-gray-400 leading-relaxed">
              Prêt pour l'interconnexion directe aux API Stripe, PayPal et Mobile Money (Orange Money, Wave, MTN).
            </p>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {futurePaymentProviders.map(p => (
                <div key={p.id} className="bg-gray-900 p-2 rounded-lg border border-gray-800 flex items-center justify-between font-mono">
                  <span className="text-gray-200 font-bold">{p.logo} {p.name}</span>
                  <span className="text-cyan-400 font-bold uppercase text-[8px]">Prêt</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
