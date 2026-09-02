import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  Zap,
  Shield,
  Star,
  Crown,
  ArrowRight,
  Clock,
  CreditCard,
  Plus,
  Pencil,
  Copy,
  CheckCircle2,
  Users,
  Package,
  ShoppingCart,
  Building2,
  Bot,
  Flame
} from 'lucide-react';
import type { PricingPlan } from '../../types';

interface PricingPlanGridProps {
  pricingPlans: PricingPlan[];
  activeTenant: any;
  paymentTargetPlan: PricingPlan | null;
  onSelectPlan: (plan: PricingPlan, amount: number, isAnnual: boolean) => void;
  currency?: string;
  isAdmin?: boolean;
  onOpenAdminPlans?: () => void;
}

export default function PricingPlanGrid({
  pricingPlans,
  activeTenant,
  paymentTargetPlan,
  onSelectPlan,
  currency = 'EUR',
  isAdmin = false,
  onOpenAdminPlans
}: PricingPlanGridProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Normalize current active tenant plan
  const currentPlanName = (activeTenant?.plan || '').toLowerCase();

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getPlanTheme = (color: string = 'blue', isPopular = false) => {
    switch (color) {
      case 'purple':
        return {
          border: 'border-purple-500/40 hover:border-purple-500/80',
          activeBorder: 'border-purple-500 ring-2 ring-purple-500/30 shadow-purple-500/10',
          badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          button: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20',
          gradient: 'from-purple-900/30 via-purple-950/10 to-transparent',
          checkIcon: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
          glow: 'bg-purple-500/10'
        };
      case 'amber':
      case 'orange':
      case 'yellow':
        return {
          border: 'border-amber-500/40 hover:border-amber-500/80',
          activeBorder: 'border-amber-500 ring-2 ring-amber-500/30 shadow-amber-500/10',
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          button: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20',
          gradient: 'from-amber-900/30 via-amber-950/10 to-transparent',
          checkIcon: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          glow: 'bg-amber-500/10'
        };
      case 'emerald':
      case 'green':
        return {
          border: 'border-emerald-500/40 hover:border-emerald-500/80',
          activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-emerald-500/10',
          badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          button: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20',
          gradient: 'from-emerald-900/30 via-emerald-950/10 to-transparent',
          checkIcon: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          glow: 'bg-emerald-500/10'
        };
      case 'cyan':
        return {
          border: 'border-cyan-500/40 hover:border-cyan-500/80',
          activeBorder: 'border-cyan-500 ring-2 ring-cyan-500/30 shadow-cyan-500/10',
          badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
          button: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20',
          gradient: 'from-cyan-900/30 via-cyan-950/10 to-transparent',
          checkIcon: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
          glow: 'bg-cyan-500/10'
        };
      case 'blue':
      default:
        return {
          border: isPopular ? 'border-blue-500/60 hover:border-blue-400' : 'border-gray-800 hover:border-gray-700',
          activeBorder: 'border-blue-500 ring-2 ring-blue-500/30 shadow-blue-500/10',
          badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
          button: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20',
          gradient: 'from-blue-900/30 via-blue-950/10 to-transparent',
          checkIcon: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
          glow: 'bg-blue-500/10'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section with title and billing cycle toggle */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-gray-850">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/25 text-blue-400">
              Offres Commerciales SaaS
            </span>
            {isAdmin && onOpenAdminPlans && (
              <button
                onClick={onOpenAdminPlans}
                className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-bold bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-lg transition"
              >
                <Pencil className="w-3 h-3" />
                Gérer les Forfaits (Admin)
              </button>
            )}
          </div>
          <h3 className="text-lg md:text-xl font-black text-white mt-1.5 font-sans">
            Grille des Forfaits & Abonnements
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
            Choisissez le forfait parfaitement dimensionné pour votre entreprise. Déclarez vos règlements par Mobile Money, Virement ou Carte en toute transparence.
          </p>
        </div>

        {/* Monthly vs Annual Toggle */}
        <div className="flex items-center gap-3 self-start md:self-auto bg-gray-950 p-1.5 rounded-2xl border border-gray-800 shadow-inner">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              billingCycle === 'monthly'
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Facturation Mensuelle
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Facturation Annuelle</span>
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
              -20% (2 mois offerts)
            </span>
          </button>
        </div>
      </div>

      {/* PRICING CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {pricingPlans.map((plan, index) => {
          const isCurrent = currentPlanName === plan.name.toLowerCase() ||
            currentPlanName.includes(plan.name.toLowerCase()) ||
            plan.name.toLowerCase().includes(currentPlanName) ||
            activeTenant?.subscriptionPlanId === plan.id;
          
          const isTarget = paymentTargetPlan?.id === plan.id;
          const isPopular = plan.isPopular || plan.id === 'plan-standard' || index === 1;

          // Price calculation based on cycle
          let calculatedPrice = plan.price;
          let periodLabel = '/ mois';
          
          if (billingCycle === 'yearly') {
            if (plan.durationDays >= 365) {
              calculatedPrice = plan.price;
              periodLabel = '/ an';
            } else if (plan.price > 0) {
              // 10 months price for 12 months (2 months free)
              calculatedPrice = Math.round(plan.price * 10);
              periodLabel = '/ an (2 mois offerts)';
            }
          }

          const theme = getPlanTheme(plan.color, isPopular);

          return (
            <div
              key={plan.id || index}
              className={`relative rounded-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl ${
                isTarget
                  ? `${theme.activeBorder} bg-gray-900`
                  : isCurrent
                  ? 'border-emerald-500/60 ring-1 ring-emerald-500/30 bg-gray-900/90'
                  : isPopular
                  ? 'border-blue-500/40 bg-gray-900/80 hover:border-blue-400'
                  : 'border-gray-850 bg-gray-950 hover:border-gray-750'
              }`}
            >
              {/* Background ambient gradient glow */}
              <div className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-2xl pointer-events-none opacity-40 bg-gradient-to-br ${theme.gradient}`} />

              <div className="p-5 relative z-10 space-y-4">
                {/* Header: Badge & Status */}
                <div className="flex items-start justify-between gap-2 min-h-[28px]">
                  {plan.badge || isPopular ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border shadow-sm ${theme.badge}`}>
                      {plan.badge ? (
                        <>
                          <Sparkles className="w-3 h-3" />
                          {plan.badge}
                        </>
                      ) : (
                        <>
                          <Star className="w-3 h-3 fill-current" />
                          Recommandé PME
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold">
                      Forfait #{index + 1}
                    </span>
                  )}

                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase">
                      <Check className="w-3 h-3" />
                      Actif
                    </span>
                  )}
                </div>

                {/* Plan Name & Slogan */}
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                    {plan.name}
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed mt-1 line-clamp-2 min-h-[32px]">
                    {plan.description || "Solution complète de gestion commerciale et point de vente."}
                  </p>
                </div>

                {/* Price Display */}
                <div className="pt-2 border-t border-gray-850">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black font-mono text-white tracking-tight">
                      {calculatedPrice.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-sm font-bold text-gray-300 font-mono">
                      {plan.currency || currency}
                    </span>
                    <span className="text-xs text-gray-400 font-medium ml-0.5">
                      {periodLabel}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && plan.price > 0 && plan.durationDays < 365 && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">
                      Économisez {(plan.price * 2).toLocaleString('fr-FR')} {plan.currency || currency} par rapport au mensuel
                    </p>
                  )}
                </div>

                {/* Resource Quotas Breakdown */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-850 text-[11px] font-mono">
                  <div className="bg-gray-950/80 p-2 rounded-xl border border-gray-850 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Utilisateurs</p>
                      <p className="text-white font-bold">{plan.limits?.maxUsers >= 99 ? 'Illimités' : `${plan.limits?.maxUsers || 1} max`}</p>
                    </div>
                  </div>

                  <div className="bg-gray-950/80 p-2 rounded-xl border border-gray-850 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Articles</p>
                      <p className="text-white font-bold">{plan.limits?.maxProducts >= 9999 ? 'Illimités' : `${plan.limits?.maxProducts || 100}`}</p>
                    </div>
                  </div>

                  <div className="bg-gray-950/80 p-2 rounded-xl border border-gray-850 flex items-center gap-2">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Ventes POS</p>
                      <p className="text-white font-bold">{plan.limits?.maxSales >= 9999 ? 'Illimitées' : `${plan.limits?.maxSales || 250}/m`}</p>
                    </div>
                  </div>

                  <div className="bg-gray-950/80 p-2 rounded-xl border border-gray-850 flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Boutiques</p>
                      <p className="text-white font-bold">{plan.limits?.maxWarehouses && plan.limits.maxWarehouses >= 10 ? 'Illimitées' : `${plan.limits?.maxWarehouses || 1} dépôt(s)`}</p>
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-2 pt-2 border-t border-gray-850">
                  <p className="text-[10px] font-mono uppercase font-bold text-gray-400 tracking-wider">
                    Fonctionnalités Clés :
                  </p>
                  <ul className="space-y-2 text-xs">
                    {plan.features && plan.features.length > 0 ? (
                      plan.features.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2 text-gray-300">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5 border ${theme.checkIcon}`}>
                            <Check className="w-2.5 h-2.5" />
                          </span>
                          <span className="leading-snug text-[11px]">{feat}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-500 italic text-[11px]">Fonctionnalités standards incluses</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Bottom CTA Action Button */}
              <div className="p-4 border-t border-gray-850 bg-gray-950/50 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    onSelectPlan(plan, calculatedPrice, billingCycle === 'yearly');
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                    isTarget
                      ? 'bg-purple-600 text-white shadow-purple-500/20 ring-2 ring-purple-400'
                      : isCurrent
                      ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                      : theme.button
                  }`}
                >
                  {isTarget ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Forfait Sélectionné (Voir paiement)
                    </>
                  ) : isCurrent ? (
                    <>
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      Renouveler ce Forfait
                    </>
                  ) : (
                    <>
                      <span>Choisir {plan.name}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
