import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Calendar, Filter, Printer, Eye, X, CheckCircle2,
  AlertCircle, DollarSign, Wallet, ArrowDownRight, Layers, FileSpreadsheet
} from 'lucide-react';
import type { Sale } from '../../types';
import { printSalesReport, generateSalesReportHtml, exportSalesToCSV } from '../../lib/salesReportPrinter';
import { getDeliveryBadge } from '../../services/posHistory';

interface SalesReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  currency: string;
  activeTenant: any;
  currentUserName?: string;
}

type PeriodPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'all';

export default function SalesReportExportModal({
  isOpen,
  onClose,
  sales,
  currency,
  activeTenant,
  currentUserName = 'Caissier'
}: SalesReportExportModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<PeriodPreset>('thisMonth');
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('Tous');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('Tous');
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState<string>('Tous');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Quick preset period updater
  const handleSelectPreset = (preset: PeriodPreset) => {
    setSelectedPreset(preset);
    const now = new Date();

    if (preset === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yestStr = yesterday.toISOString().slice(0, 10);
      setStartDate(yestStr);
      setEndDate(yestStr);
    } else if (preset === 'last7') {
      const past7 = new Date(now);
      past7.setDate(now.getDate() - 6);
      setStartDate(past7.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'last30') {
      const past30 = new Date(now);
      past30.setDate(now.getDate() - 29);
      setStartDate(past30.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'lastMonth') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().slice(0, 10));
      setEndDate(lastDayLastMonth.toISOString().slice(0, 10));
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filter sales based on period and options
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const sDateStr = s.date ? s.date.slice(0, 10) : '';

      // Date period check
      if (startDate && sDateStr && sDateStr < startDate) return false;
      if (endDate && sDateStr && sDateStr > endDate) return false;

      // Payment method
      if (filterPaymentMethod !== 'Tous') {
        const method = String(s.paymentMethod || '').toLowerCase();
        if (filterPaymentMethod === 'especes' && method !== 'especes') return false;
        if (filterPaymentMethod === 'mobile_money' && method !== 'mobile_money') return false;
        if (filterPaymentMethod === 'carte' && method !== 'carte') return false;
        if (filterPaymentMethod === 'virement' && method !== 'virement') return false;
        if (filterPaymentMethod === 'credit' && method !== 'credit') return false;
      }

      // Payment status
      if (filterPaymentStatus !== 'Tous') {
        const isPaid = s.status === 'Payée' || s.paymentStatus === 'Payé' || s.paymentMethod !== 'credit';
        const isPartial = s.status === 'Partiellement payée' || s.paymentStatus === 'Partiellement payé';

        if (filterPaymentStatus === 'Payé' && !isPaid) return false;
        if (filterPaymentStatus === 'Partiel' && !isPartial) return false;
        if (filterPaymentStatus === 'Non payé' && (isPaid || isPartial)) return false;
      }

      // Delivery status
      if (filterDeliveryStatus !== 'Tous') {
        const badge = getDeliveryBadge(s.deliveryStatus);
        if (badge.normalized !== filterDeliveryStatus) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, startDate, endDate, filterPaymentMethod, filterPaymentStatus, filterDeliveryStatus]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalRev = 0;
    let totalCollected = 0;
    let totalItems = 0;

    filteredSales.forEach(s => {
      const t = Number(s.total || 0);
      totalRev += t;

      const isPaid = s.status === 'Payée' || s.paymentStatus === 'Payé' || s.paymentMethod !== 'credit';
      const isPartial = s.status === 'Partiellement payée' || s.paymentStatus === 'Partiellement payé';

      let col = 0;
      if (s.creditPaidAmount !== undefined) {
        col = Number(s.creditPaidAmount);
      } else if (isPaid) {
        col = t;
      } else if (isPartial) {
        col = Number(s.creditPaidAmount || 0);
      }
      totalCollected += col;

      if (Array.isArray(s.items)) {
        s.items.forEach(it => {
          totalItems += Number(it.quantity || 1);
        });
      }
    });

    const totalDue = Math.max(0, totalRev - totalCollected);
    const avgBasket = filteredSales.length > 0 ? totalRev / filteredSales.length : 0;

    return {
      count: filteredSales.length,
      totalRev,
      totalCollected,
      totalDue,
      totalItems,
      avgBasket
    };
  }, [filteredSales]);

  // Handle printing / saving as PDF
  const handlePrint = () => {
    printSalesReport({
      sales: filteredSales,
      period: {
        startDate,
        endDate,
        presetLabel: selectedPreset === 'all'
          ? 'Tout l\'historique'
          : selectedPreset === 'today'
            ? 'Aujourd\'hui'
            : selectedPreset === 'yesterday'
              ? 'Hier'
              : selectedPreset === 'thisMonth'
                ? 'Ce mois-ci'
                : selectedPreset === 'lastMonth'
                  ? 'Mois dernier'
                  : 'Personnalisé'
      },
      filters: {
        paymentMethod: filterPaymentMethod,
        paymentStatus: filterPaymentStatus,
        deliveryStatus: filterDeliveryStatus
      },
      tenant: activeTenant,
      currency,
      orientation,
      generatedBy: currentUserName,
      title: 'EXTRACTION & JOURNAL DES VENTES'
    });
  };

  // Generate HTML for on-screen preview
  const previewHtml = useMemo(() => {
    if (!isPreviewOpen) return '';
    return generateSalesReportHtml({
      sales: filteredSales,
      period: {
        startDate,
        endDate,
        presetLabel: selectedPreset === 'all'
          ? 'Tout l\'historique'
          : selectedPreset === 'today'
            ? 'Aujourd\'hui'
            : selectedPreset === 'yesterday'
              ? 'Hier'
              : selectedPreset === 'thisMonth'
                ? 'Ce mois-ci'
                : 'Personnalisé'
      },
      filters: {
        paymentMethod: filterPaymentMethod,
        paymentStatus: filterPaymentStatus,
        deliveryStatus: filterDeliveryStatus
      },
      tenant: activeTenant,
      currency,
      orientation,
      generatedBy: currentUserName,
      title: 'EXTRACTION & JOURNAL DES VENTES'
    });
  }, [isPreviewOpen, filteredSales, startDate, endDate, selectedPreset, filterPaymentMethod, filterPaymentStatus, filterDeliveryStatus, activeTenant, currency, orientation, currentUserName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-950/85 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-gray-900 border border-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gray-950/60 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/15 p-2.5 rounded-xl border border-blue-500/20 text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Extraction & Rapport PDF des Ventes
                <span className="text-[10px] font-mono font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  Format A4 Pro
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                Générez un journal certifié des ventes avec en-tête d'entreprise, indicateurs comptables et détail des transactions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL CONTENT */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* PRESETS BUTTONS */}
          <div>
            <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              Période Rapide
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'today', label: 'Aujourd\'hui' },
                { id: 'yesterday', label: 'Hier' },
                { id: 'last7', label: '7 derniers jours' },
                { id: 'thisMonth', label: 'Ce mois-ci' },
                { id: 'lastMonth', label: 'Mois dernier' },
                { id: 'all', label: 'Tout l\'historique' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id as PeriodPreset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    selectedPreset === p.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* DATES & CRITERIA GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-950/60 p-3.5 rounded-xl border border-gray-850">
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1">
                Date de début
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedPreset('all');
                }}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 outline-none transition font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1">
                Date de fin
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedPreset('all');
                }}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 outline-none transition font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1">
                Mode Règlement
              </label>
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 outline-none transition font-mono"
              >
                <option value="Tous">Tous les modes</option>
                <option value="especes">Espèces (Cash)</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="carte">Carte Bancaire</option>
                <option value="virement">Virement</option>
                <option value="credit">Vente à Crédit</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase mb-1">
                Statut Livraison
              </label>
              <select
                value={filterDeliveryStatus}
                onChange={(e) => setFilterDeliveryStatus(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 outline-none transition font-mono"
              >
                <option value="Tous">Toutes les livraisons</option>
                <option value="Livrée">Livrée</option>
                <option value="Partiellement livrée">Partiellement livrée</option>
                <option value="Non livrée">Non livrée</option>
                <option value="Retournée">Retournée</option>
              </select>
            </div>
          </div>

          {/* SECONDARY SETTINGS: STATUT REGLEMENT & ORIENTATION */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-mono text-[11px]">Statut Règlement :</span>
              {['Tous', 'Payé', 'Partiel', 'Non payé'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterPaymentStatus(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    filterPaymentStatus === st
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'bg-gray-950 text-gray-400 border border-gray-850 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-mono text-[11px]">Orientation :</span>
              <button
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  orientation === 'landscape'
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-gray-950 text-gray-400 border border-gray-850 hover:text-white'
                }`}
              >
                Paysage (Recommandé)
              </button>
              <button
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  orientation === 'portrait'
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-gray-950 text-gray-400 border border-gray-850 hover:text-white'
                }`}
              >
                Portrait
              </button>
            </div>
          </div>

          {/* DYNAMIC KPI SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-950 border border-gray-850 p-3.5 rounded-xl">
              <span className="text-[10px] font-mono text-gray-500 uppercase block font-bold">Ventes Filtrées</span>
              <div className="text-xl font-black font-mono text-white mt-1">
                {stats.count}
              </div>
              <span className="text-[10px] text-gray-500">{stats.totalItems} articles vendus</span>
            </div>

            <div className="bg-gray-950 border border-gray-850 p-3.5 rounded-xl">
              <span className="text-[10px] font-mono text-gray-500 uppercase block font-bold">Chiffre d'Affaires</span>
              <div className="text-xl font-black font-mono text-blue-400 mt-1">
                {Math.round(stats.totalRev).toLocaleString('fr-FR')} <span className="text-xs text-gray-400">{currency}</span>
              </div>
              <span className="text-[10px] text-gray-500">Panier moyen: {Math.round(stats.avgBasket).toLocaleString('fr-FR')} {currency}</span>
            </div>

            <div className="bg-gray-950 border border-emerald-500/20 p-3.5 rounded-xl bg-emerald-500/5">
              <span className="text-[10px] font-mono text-emerald-400 uppercase block font-bold">Montant Encaissé</span>
              <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                {Math.round(stats.totalCollected).toLocaleString('fr-FR')} <span className="text-xs text-emerald-300">{currency}</span>
              </div>
              <span className="text-[10px] text-emerald-400/80">
                Taux: {stats.totalRev > 0 ? ((stats.totalCollected / stats.totalRev) * 100).toFixed(1) : 0}%
              </span>
            </div>

            <div className="bg-gray-950 border border-amber-500/20 p-3.5 rounded-xl bg-amber-500/5">
              <span className="text-[10px] font-mono text-amber-400 uppercase block font-bold">Reste à Recouvrer</span>
              <div className="text-xl font-black font-mono text-amber-400 mt-1">
                {Math.round(stats.totalDue).toLocaleString('fr-FR')} <span className="text-xs text-amber-300">{currency}</span>
              </div>
              <span className="text-[10px] text-amber-400/80">
                {stats.totalDue > 0 ? 'Créances à percevoir' : 'Soldé'}
              </span>
            </div>
          </div>

          {/* TABLE PREVIEW */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">
                Aperçu des Lignes ({filteredSales.length} opérations)
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {startDate && endDate ? `${startDate} au ${endDate}` : 'Toutes dates'}
              </span>
            </div>
            <div className="border border-gray-850 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-gray-950/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-950 text-[10px] font-bold text-gray-400 border-b border-gray-850 uppercase font-mono sticky top-0">
                  <tr>
                    <th className="p-2 pl-3">Facture</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Règlement</th>
                    <th className="p-2 text-center">Livraison</th>
                    <th className="p-2 pr-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-850/40 text-xs">
                  {filteredSales.length > 0 ? filteredSales.map(sale => {
                    const delivBadge = getDeliveryBadge(sale.deliveryStatus);
                    return (
                      <tr key={sale.id} className="hover:bg-gray-850/30 text-gray-300">
                        <td className="p-2 pl-3 font-mono font-bold text-blue-400">
                          {sale.invoiceNumber}
                        </td>
                        <td className="p-2 text-gray-400 font-mono text-[11px]">
                          {new Date(sale.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="p-2 font-medium text-white">
                          {sale.customerName || 'Passager'}
                        </td>
                        <td className="p-2 uppercase font-mono text-[10px] text-gray-400">
                          {sale.paymentMethod}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${delivBadge.bgClass}`}>
                            {delivBadge.label}
                          </span>
                        </td>
                        <td className="p-2 pr-3 text-right font-mono font-bold text-white">
                          {Math.round(sale.total).toLocaleString('fr-FR')} {currency}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-500 text-xs italic">
                        Aucune vente trouvée pour les critères et la période sélectionnés.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={() => {
              handleSelectPreset('all');
              setFilterPaymentMethod('Tous');
              setFilterPaymentStatus('Tous');
              setFilterDeliveryStatus('Tous');
            }}
            className="text-xs text-gray-400 hover:text-white transition underline"
          >
            Réinitialiser les filtres
          </button>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => exportSalesToCSV(filteredSales, currency, activeTenant?.name)}
              disabled={filteredSales.length === 0}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 disabled:opacity-40 disabled:cursor-not-allowed transition text-emerald-400 text-xs font-semibold rounded-xl border border-gray-700 flex items-center gap-1.5"
              title="Télécharger les données filtrées au format Excel/CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Excel / CSV
            </button>

            <button
              onClick={() => setIsPreviewOpen(true)}
              disabled={filteredSales.length === 0}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-750 disabled:opacity-40 disabled:cursor-not-allowed transition text-gray-200 text-xs font-semibold rounded-xl border border-gray-700 flex items-center gap-1.5"
            >
              <Eye className="w-4 h-4 text-blue-400" />
              Aperçu Document
            </button>

            <button
              onClick={handlePrint}
              disabled={filteredSales.length === 0}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition text-gray-950 text-xs font-black rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer / Enregistrer en PDF
            </button>
          </div>
        </div>
      </motion.div>

      {/* FULL-SCREEN PREVIEW MODAL */}
      <AnimatePresence>
        {isPreviewOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-gray-900 border border-gray-750 w-full max-w-5xl h-[92vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 bg-gray-950 border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <Eye className="w-5 h-5 text-blue-400" />
                  <span className="text-sm font-bold text-white">
                    Aperçu Rendu PDF (A4 {orientation === 'landscape' ? 'Paysage' : 'Portrait'})
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Lancer Impression / PDF
                  </button>
                  <button
                    onClick={() => setIsPreviewOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-gray-300 p-2 overflow-auto">
                <iframe
                  title="PDF Preview"
                  srcDoc={previewHtml}
                  className="w-full h-full bg-white shadow-md rounded border-0"
                />
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
