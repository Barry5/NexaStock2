import type { Sale } from '../types';
import { getDeliveryBadge } from '../services/posHistory';

export interface SalesReportPeriod {
  startDate?: string;
  endDate?: string;
  presetLabel?: string;
}

export interface SalesReportFilters {
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryStatus?: string;
  customerId?: string;
  customerName?: string;
  search?: string;
}

export interface SalesReportOptions {
  sales: Sale[];
  period?: SalesReportPeriod;
  filters?: SalesReportFilters;
  tenant?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxId?: string;
    currency?: string;
    logo?: string;
    receiptFooter?: string;
  };
  currency?: string;
  orientation?: 'portrait' | 'landscape';
  generatedBy?: string;
  title?: string;
}

function escapeHtml(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatCurrency(amount: number, curr = 'GNF'): string {
  return `${Math.round(amount || 0).toLocaleString('fr-FR')} ${curr}`;
}

export function generateSalesReportHtml({
  sales,
  period,
  filters,
  tenant,
  currency = 'GNF',
  orientation = 'landscape',
  generatedBy = 'Caisse Centrale',
  title = 'EXTRACTION & JOURNAL DES VENTES'
}: SalesReportOptions): string {
  const tenantName = tenant?.name || 'NexaStock Multi-Tenant ERP';
  const tenantAddress = tenant?.address || 'Adresse de l\'établissement';
  const tenantPhone = tenant?.phone || '';
  const tenantEmail = tenant?.email || '';
  const tenantTaxId = tenant?.taxId || '';
  const tenantLogo = tenant?.logo?.trim();

  // Metrics computation
  const totalSalesCount = sales.length;
  let totalGrossRevenue = 0;
  let totalDiscounts = 0;
  let totalCollected = 0;
  let totalRemainingDue = 0;
  let totalItemsCount = 0;

  const paymentBreakdown: Record<string, { count: number; total: number; collected: number }> = {
    especes: { count: 0, total: 0, collected: 0 },
    mobile_money: { count: 0, total: 0, collected: 0 },
    carte: { count: 0, total: 0, collected: 0 },
    virement: { count: 0, total: 0, collected: 0 },
    credit: { count: 0, total: 0, collected: 0 },
    autre: { count: 0, total: 0, collected: 0 }
  };

  const deliveryStats = {
    delivered: 0,
    partiallyDelivered: 0,
    notDelivered: 0,
    returned: 0
  };

  sales.forEach(s => {
    const saleTotal = Number(s.total || 0);
    const saleDiscount = Number(s.discount || 0);
    totalGrossRevenue += saleTotal;
    totalDiscounts += saleDiscount;

    // Items count
    if (Array.isArray(s.items)) {
      s.items.forEach(it => {
        totalItemsCount += Number(it.quantity || 1);
      });
    }

    // Collected & Due calculation
    const isPaid = s.status === 'Payée' || s.paymentStatus === 'Payé' || s.paymentMethod !== 'credit';
    const isPartial = s.status === 'Partiellement payée' || s.paymentStatus === 'Partiellement payé';

    let collected = 0;
    if (s.creditPaidAmount !== undefined) {
      collected = Number(s.creditPaidAmount);
    } else if (isPaid) {
      collected = saleTotal;
    } else if (isPartial) {
      collected = Number(s.creditPaidAmount || 0);
    } else {
      collected = 0;
    }

    const remaining = Math.max(0, saleTotal - collected);
    totalCollected += collected;
    totalRemainingDue += remaining;

    // Payment method breakdown
    const rawMethod = String(s.paymentMethod || 'especes').toLowerCase();
    const methodKey = paymentBreakdown[rawMethod] ? rawMethod : 'autre';
    paymentBreakdown[methodKey].count += 1;
    paymentBreakdown[methodKey].total += saleTotal;
    paymentBreakdown[methodKey].collected += collected;

    // Delivery stats
    const delivBadge = getDeliveryBadge(s.deliveryStatus);
    if (delivBadge.normalized === 'Livrée') {
      deliveryStats.delivered += 1;
    } else if (delivBadge.normalized === 'Partiellement livrée') {
      deliveryStats.partiallyDelivered += 1;
    } else if (delivBadge.normalized === 'Retournée') {
      deliveryStats.returned += 1;
    } else {
      deliveryStats.notDelivered += 1;
    }
  });

  const averageBasket = totalSalesCount > 0 ? totalGrossRevenue / totalSalesCount : 0;
  const collectionRate = totalGrossRevenue > 0 ? (totalCollected / totalGrossRevenue) * 100 : 0;

  // Period label
  const periodDisplay = (() => {
    if (period?.presetLabel && period.presetLabel !== 'Personnalisé') {
      return period.presetLabel;
    }
    if (period?.startDate && period?.endDate) {
      const startFormatted = new Date(period.startDate).toLocaleDateString('fr-FR');
      const endFormatted = new Date(period.endDate).toLocaleDateString('fr-FR');
      return `Du ${startFormatted} au ${endFormatted}`;
    }
    if (period?.startDate) {
      return `À partir du ${new Date(period.startDate).toLocaleDateString('fr-FR')}`;
    }
    if (period?.endDate) {
      return `Jusqu'au ${new Date(period.endDate).toLocaleDateString('fr-FR')}`;
    }
    return 'Historique Complet';
  })();

  const printDateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const referenceCode = `EXT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Logo or Monogram
  const logoHtml = tenantLogo
    ? `<img src="${escapeHtml(tenantLogo)}" alt="Logo" class="company-logo" />`
    : `<div class="company-monogram">${escapeHtml(tenantName.slice(0, 2).toUpperCase())}</div>`;

  // Filter notes
  const activeFilterPills: string[] = [];
  if (filters?.paymentMethod && filters.paymentMethod !== 'Tous') {
    activeFilterPills.push(`Règlement : ${filters.paymentMethod}`);
  }
  if (filters?.paymentStatus && filters.paymentStatus !== 'Tous') {
    activeFilterPills.push(`Paiement : ${filters.paymentStatus}`);
  }
  if (filters?.deliveryStatus && filters.deliveryStatus !== 'Tous') {
    activeFilterPills.push(`Livraison : ${filters.deliveryStatus}`);
  }
  if (filters?.customerName) {
    activeFilterPills.push(`Client : ${filters.customerName}`);
  }

  // Rows of sales table
  const salesRowsHtml = sales.map((sale, index) => {
    const saleDate = new Date(sale.date);
    const dateFormatted = !isNaN(saleDate.getTime())
      ? saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : sale.date;
    const timeFormatted = !isNaN(saleDate.getTime())
      ? saleDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const isPaid = sale.status === 'Payée' || sale.paymentStatus === 'Payé' || sale.paymentMethod !== 'credit';
    const isPartial = sale.status === 'Partiellement payée' || sale.paymentStatus === 'Partiellement payé';

    let paidAmt = 0;
    if (sale.creditPaidAmount !== undefined) {
      paidAmt = Number(sale.creditPaidAmount);
    } else if (isPaid) {
      paidAmt = Number(sale.total);
    } else if (isPartial) {
      paidAmt = Number(sale.creditPaidAmount || 0);
    }

    const dueAmt = Math.max(0, Number(sale.total) - paidAmt);

    const paymentLabel = (() => {
      switch (String(sale.paymentMethod || 'especes')) {
        case 'especes': return 'Espèces';
        case 'mobile_money': return 'Mobile Money';
        case 'carte': return 'Carte Bancaire';
        case 'virement': return 'Virement';
        case 'credit': return 'À Crédit';
        default: return String(sale.paymentMethod || 'Espèces');
      }
    })();

    const paymentStatusBadge = isPaid
      ? `<span class="badge badge-success">Payé</span>`
      : isPartial
        ? `<span class="badge badge-warning">Partiel</span>`
        : `<span class="badge badge-danger">Non Payé</span>`;

    const deliveryBadge = getDeliveryBadge(sale.deliveryStatus);
    const deliveryStatusBadge = `<span class="badge" style="background:${deliveryBadge.bgClass.includes('emerald') ? '#d1fae5;color:#065f46;border-color:#a7f3d0' : deliveryBadge.bgClass.includes('amber') ? '#fef3c7;color:#92400e;border-color:#fde68a' : deliveryBadge.bgClass.includes('purple') ? '#f3e8ff;color:#6b21a8;border-color:#e9d5ff' : '#fee2e2;color:#991b1b;border-color:#fecaca'}">${escapeHtml(deliveryBadge.label)}</span>`;

    // Summary of items
    const itemsSummary = (sale.items || [])
      .map(it => `${it.productName}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`)
      .join(', ');

    return `
      <tr class="${index % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="col-num text-center">${index + 1}</td>
        <td class="col-ref font-mono font-bold text-navy">${escapeHtml(sale.invoiceNumber)}</td>
        <td class="col-date">
          <div class="font-bold">${escapeHtml(dateFormatted)}</div>
          <div class="text-muted text-xs">${escapeHtml(timeFormatted)}</div>
        </td>
        <td class="col-client">
          <div class="font-bold text-dark">${escapeHtml(sale.customerName || 'Client Passager')}</div>
          ${sale.customerId ? `<div class="text-muted text-xs">Réf: ${escapeHtml(sale.customerId)}</div>` : ''}
        </td>
        <td class="col-items text-muted" title="${escapeHtml(itemsSummary)}">
          <div class="truncate-text">${escapeHtml(itemsSummary || 'Vente directe')}</div>
        </td>
        <td class="col-method text-center">
          <span class="method-tag">${escapeHtml(paymentLabel)}</span>
        </td>
        <td class="col-pay-status text-center">${paymentStatusBadge}</td>
        <td class="col-deliv-status text-center">${deliveryStatusBadge}</td>
        <td class="col-amount text-right font-mono font-bold text-dark">${Math.round(sale.total).toLocaleString('fr-FR')}</td>
        <td class="col-amount text-right font-mono text-emerald">${Math.round(paidAmt).toLocaleString('fr-FR')}</td>
        <td class="col-amount text-right font-mono font-bold ${dueAmt > 0 ? 'text-danger' : 'text-muted'}">${Math.round(dueAmt).toLocaleString('fr-FR')}</td>
      </tr>
    `;
  }).join('');

  // Payment Breakdown Summary rows
  const paymentMethodLabels: Record<string, string> = {
    especes: 'Espèces (Cash)',
    mobile_money: 'Mobile Money (Orange/MTN)',
    carte: 'Carte Bancaire / TPE',
    virement: 'Virement Bancaire',
    credit: 'Ventes à Crédit',
    autre: 'Autres Modalités'
  };

  const paymentBreakdownRows = Object.entries(paymentBreakdown)
    .filter(([_, data]) => data.count > 0 || data.total > 0)
    .map(([key, data]) => {
      const share = totalGrossRevenue > 0 ? ((data.total / totalGrossRevenue) * 100).toFixed(1) : '0';
      return `
        <tr>
          <td class="font-bold">${paymentMethodLabels[key] || key}</td>
          <td class="text-center font-mono">${data.count}</td>
          <td class="text-right font-mono font-bold">${Math.round(data.total).toLocaleString('fr-FR')} ${escapeHtml(currency)}</td>
          <td class="text-right font-mono text-emerald">${Math.round(data.collected).toLocaleString('fr-FR')} ${escapeHtml(currency)}</td>
          <td class="text-right font-mono text-muted">${share} %</td>
        </tr>
      `;
    }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - ${escapeHtml(tenantName)}</title>
  <style>
    /* PAGE SETUP FOR A4 PRINTING */
    @page {
      size: A4 ${orientation};
      margin: 8mm 10mm 10mm 10mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9.5px;
      line-height: 1.35;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 12px;
    }

    /* TYPOGRAPHY HELPERS */
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-muted { color: #64748b; }
    .text-dark { color: #0f172a; }
    .text-navy { color: #1e40af; }
    .text-emerald { color: #059669; }
    .text-danger { color: #dc2626; }
    .text-amber { color: #d97706; }
    .text-xs { font-size: 8px; }

    /* HEADER BLOCK */
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .company-logo {
      max-height: 52px;
      max-width: 140px;
      object-fit: contain;
    }

    .company-monogram {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 1px;
    }

    .company-details h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .company-details p {
      margin: 2px 0 0 0;
      font-size: 9px;
      color: #475569;
    }

    .meta-section {
      text-align: right;
    }

    .doc-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .meta-section h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.2px;
    }

    .period-pill {
      display: inline-block;
      margin-top: 4px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
    }

    /* KPI CARDS GRID */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .kpi-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      background: #f8fafc;
    }

    .kpi-card.highlight {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }

    .kpi-card.warning {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .kpi-label {
      font-size: 7.5px;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 3px;
    }

    .kpi-val {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .kpi-sub {
      font-size: 7.5px;
      color: #64748b;
      margin-top: 2px;
    }

    /* FILTER TAGS */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
      font-size: 8.5px;
      color: #475569;
    }

    .filter-tag {
      background: #e2e8f0;
      border-radius: 4px;
      padding: 1px 6px;
      font-weight: 600;
      color: #1e293b;
    }

    /* MASTER TABLE */
    table.sales-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 14px;
    }

    table.sales-table thead {
      display: table-header-group;
    }

    table.sales-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 6px 8px;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #0f172a;
    }

    table.sales-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    .row-even { background: #ffffff; }
    .row-odd { background: #f8fafc; }

    .truncate-text {
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 7.5px;
      font-weight: 800;
      text-transform: uppercase;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .badge-success { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
    .badge-warning { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .badge-danger { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

    .method-tag {
      display: inline-block;
      padding: 1.5px 5px;
      border-radius: 3px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      font-size: 7.5px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
    }

    /* TOTALS ROW */
    table.sales-table tfoot td {
      background: #f1f5f9;
      font-weight: 900;
      font-size: 10px;
      padding: 8px;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      color: #0f172a;
    }

    /* BOTTOM SUMMARY GRIDS */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 14px;
      margin-top: 10px;
      page-break-inside: avoid;
    }

    .summary-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      background: #f8fafc;
    }

    .summary-box h3 {
      margin: 0 0 6px 0;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }

    table.mini-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
    }

    table.mini-table th, table.mini-table td {
      padding: 3px 6px;
      border-bottom: 1px solid #e2e8f0;
    }

    table.mini-table th {
      color: #64748b;
      font-size: 7.5px;
      text-transform: uppercase;
    }

    /* SIGNATURES BLOCK */
    .signatures-block {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 14px;
      page-break-inside: avoid;
    }

    .signature-card {
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 10px;
      min-height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fafafa;
    }

    .signature-title {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
    }

    .signature-line {
      border-bottom: 1px solid #cbd5e1;
      margin-top: 25px;
    }

    /* FOOTER */
    .report-footer {
      margin-top: 14px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #94a3b8;
    }

    /* PRINT RULES */
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-container">
    <div class="brand-section">
      ${logoHtml}
      <div class="company-details">
        <h1>${escapeHtml(tenantName)}</h1>
        <p><strong>Adresse :</strong> ${escapeHtml(tenantAddress)} ${tenantPhone ? `| <strong>Tél :</strong> ${escapeHtml(tenantPhone)}` : ''}</p>
        <p>${tenantEmail ? `<strong>Email :</strong> ${escapeHtml(tenantEmail)}` : ''} ${tenantTaxId ? `| <strong>NIF / Fiscal :</strong> ${escapeHtml(tenantTaxId)}` : ''}</p>
      </div>
    </div>

    <div class="meta-section">
      <div class="doc-badge">DOCUMENT OFFICIEL DE GESTION</div>
      <h2>${escapeHtml(title)}</h2>
      <div>
        <span class="period-pill">📅 ${escapeHtml(periodDisplay)}</span>
      </div>
      <div class="text-muted text-xs" style="margin-top: 4px;">
        Réf : <strong class="font-mono text-dark">${escapeHtml(referenceCode)}</strong> | Édité le : <strong>${escapeHtml(printDateStr)}</strong>
      </div>
      <div class="text-muted text-xs">
        Opérateur : <strong>${escapeHtml(generatedBy)}</strong>
      </div>
    </div>
  </div>

  <!-- KPI SUMMARY CARDS -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Transactions (Ventes)</div>
      <div class="kpi-val">${totalSalesCount}</div>
      <div class="kpi-sub">${totalItemsCount} articles vendus au total</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Chiffre d'Affaires Net</div>
      <div class="kpi-val">${Math.round(totalGrossRevenue).toLocaleString('fr-FR')} <span style="font-size:9px;">${escapeHtml(currency)}</span></div>
      <div class="kpi-sub">${totalDiscounts > 0 ? `Remises accordées: -${Math.round(totalDiscounts).toLocaleString('fr-FR')} ${escapeHtml(currency)}` : 'Remises déduites'}</div>
    </div>

    <div class="kpi-card highlight">
      <div class="kpi-label">Montant Encaissé (Cash/Reçu)</div>
      <div class="kpi-val text-emerald">${Math.round(totalCollected).toLocaleString('fr-FR')} <span style="font-size:9px;">${escapeHtml(currency)}</span></div>
      <div class="kpi-sub">Taux d'encaissement : <strong>${collectionRate.toFixed(1)} %</strong></div>
    </div>

    <div class="kpi-card ${totalRemainingDue > 0 ? 'warning' : ''}">
      <div class="kpi-label">Reste à Recouvrer (Crédits)</div>
      <div class="kpi-val ${totalRemainingDue > 0 ? 'text-danger' : 'text-muted'}">${Math.round(totalRemainingDue).toLocaleString('fr-FR')} <span style="font-size:9px;">${escapeHtml(currency)}</span></div>
      <div class="kpi-sub">${totalRemainingDue > 0 ? 'Créances clients actives' : 'Aucune créance en attente'}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Panier Moyen / Vente</div>
      <div class="kpi-val text-navy">${Math.round(averageBasket).toLocaleString('fr-FR')} <span style="font-size:9px;">${escapeHtml(currency)}</span></div>
      <div class="kpi-sub">Livraisons : ${deliveryStats.delivered} livrées / ${deliveryStats.notDelivered} en attente</div>
    </div>
  </div>

  ${activeFilterPills.length > 0 ? `
    <div class="filter-bar">
      <span>Filtres appliqués :</span>
      ${activeFilterPills.map(p => `<span class="filter-tag">${escapeHtml(p)}</span>`).join('')}
    </div>
  ` : ''}

  <!-- MASTER SALES TABLE -->
  <table class="sales-table">
    <thead>
      <tr>
        <th style="width: 25px;">#</th>
        <th style="width: 85px;">N° Facture</th>
        <th style="width: 75px;">Date & Heure</th>
        <th style="width: 120px;">Client</th>
        <th>Articles / Désignation</th>
        <th style="width: 90px; text-align: center;">Règlement</th>
        <th style="width: 70px; text-align: center;">Paiement</th>
        <th style="width: 70px; text-align: center;">Livraison</th>
        <th style="width: 85px; text-align: right;">Total (${escapeHtml(currency)})</th>
        <th style="width: 85px; text-align: right;">Encaissé (${escapeHtml(currency)})</th>
        <th style="width: 85px; text-align: right;">Solde Dû (${escapeHtml(currency)})</th>
      </tr>
    </thead>
    <tbody>
      ${salesRowsHtml.length > 0 ? salesRowsHtml : `
        <tr>
          <td colspan="11" class="text-center text-muted" style="padding: 24px;">
            Aucune vente ne correspond aux critères et à la période sélectionnée.
          </td>
        </tr>
      `}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="8" class="text-right">
          TOTAL GÉNÉRAL SUR LA PÉRIODE (${totalSalesCount} VENTE${totalSalesCount > 1 ? 'S' : ''}) :
        </td>
        <td class="text-right font-mono">${Math.round(totalGrossRevenue).toLocaleString('fr-FR')}</td>
        <td class="text-right font-mono text-emerald">${Math.round(totalCollected).toLocaleString('fr-FR')}</td>
        <td class="text-right font-mono ${totalRemainingDue > 0 ? 'text-danger' : ''}">${Math.round(totalRemainingDue).toLocaleString('fr-FR')}</td>
      </tr>
    </tfoot>
  </table>

  <!-- BOTTOM SECTIONS: PAYMENT BREAKDOWN & SIGNATURES -->
  <div class="bottom-grid">
    <div class="summary-box">
      <h3>Ventilation par Mode de Règlement</h3>
      <table class="mini-table">
        <thead>
          <tr>
            <th>Mode</th>
            <th class="text-center">Ventes</th>
            <th class="text-right">Volume Total</th>
            <th class="text-right">Encaissé</th>
            <th class="text-right">Part (%)</th>
          </tr>
        </thead>
        <tbody>
          ${paymentBreakdownRows || '<tr><td colspan="5" class="text-center text-muted">Aucune donnée de paiement.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="summary-box">
      <h3>Suivi Logistique & Livraisons</h3>
      <table class="mini-table">
        <tbody>
          <tr>
            <td>Commandes Totalement Livrées :</td>
            <td class="text-right font-bold text-emerald font-mono">${deliveryStats.delivered}</td>
          </tr>
          <tr>
            <td>Partiellement Livrées :</td>
            <td class="text-right font-bold text-amber font-mono">${deliveryStats.partiallyDelivered}</td>
          </tr>
          <tr>
            <td>En Attente de Livraison :</td>
            <td class="text-right font-bold text-danger font-mono">${deliveryStats.notDelivered}</td>
          </tr>
          <tr>
            <td>Retours / Annulations :</td>
            <td class="text-right font-bold text-muted font-mono">${deliveryStats.returned}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- SIGNATURES BLOCK -->
  <div class="signatures-block">
    <div class="signature-card">
      <div class="signature-title">Émis par (Caisse)</div>
      <div class="text-xs text-muted">Nom : ${escapeHtml(generatedBy)}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-card">
      <div class="signature-title">Visa Comptabilité / Audit</div>
      <div class="text-xs text-muted">Conforme aux états de caisse</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-card">
      <div class="signature-title">Direction Générale / Approbation</div>
      <div class="text-xs text-muted">Cachet & Signature</div>
      <div class="signature-line"></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="report-footer">
    <div>Rapport généré par NexaStock Multi-Tenant ERP • Document comptable officiel</div>
    <div>Page 1 sur 1 • Réf: ${escapeHtml(referenceCode)}</div>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      // Auto print if opened directly
      setTimeout(() => {
        try {
          window.focus();
          window.print();
        } catch(e) {}
      }, 350);
    });
  </script>
</body>
</html>`;
}

/**
 * Prints the professional sales report via an isolated hidden iframe
 * ensuring the host screen is never captured and print styles are cleanly applied.
 */
export function printSalesReport(options: SalesReportOptions): void {
  const html = generateSalesReportHtml(options);

  try {
    const existingIframe = document.getElementById('sales-report-print-iframe');
    if (existingIframe && existingIframe.parentNode) {
      existingIframe.parentNode.removeChild(existingIframe);
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'sales-report-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      throw new Error('Unable to access print iframe document');
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printErr) {
        console.warn('Iframe print failed, fallback to window.open', printErr);
        fallbackWindowPrint(html);
      }

      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {
          // ignore
        }
      }, 60000);
    }, 300);
  } catch (err) {
    console.warn('Error during sales report printing:', err);
    fallbackWindowPrint(html);
  }
}

function fallbackWindowPrint(html: string): void {
  try {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 400);
    } else {
      window.print();
    }
  } catch {
    window.print();
  }
}

/**
 * Exports the sales list to a clean CSV/Excel file with UTF-8 BOM
 */
export function exportSalesToCSV(sales: Sale[], currency = 'GNF', tenantName = 'NexaStock'): void {
  const headers = [
    'N° Facture',
    'Date',
    'Heure',
    'Client',
    'Mode Règlement',
    'Statut Paiement',
    'Statut Livraison',
    'Articles',
    `Total (${currency})`,
    `Encaissé (${currency})`,
    `Reste Dû (${currency})`
  ];

  const rows = sales.map(sale => {
    const saleDate = new Date(sale.date);
    const dateFormatted = !isNaN(saleDate.getTime()) ? saleDate.toLocaleDateString('fr-FR') : sale.date;
    const timeFormatted = !isNaN(saleDate.getTime()) ? saleDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

    const isPaid = sale.status === 'Payée' || sale.paymentStatus === 'Payé' || sale.paymentMethod !== 'credit';
    const isPartial = sale.status === 'Partiellement payée' || sale.paymentStatus === 'Partiellement payé';

    let paidAmt = 0;
    if (sale.creditPaidAmount !== undefined) {
      paidAmt = Number(sale.creditPaidAmount);
    } else if (isPaid) {
      paidAmt = Number(sale.total);
    } else if (isPartial) {
      paidAmt = Number(sale.creditPaidAmount || 0);
    }
    const dueAmt = Math.max(0, Number(sale.total) - paidAmt);

    const itemsSummary = (sale.items || [])
      .map(it => `${it.productName}${it.quantity > 1 ? ` x${it.quantity}` : ''}`)
      .join('; ');

    const delivBadge = getDeliveryBadge(sale.deliveryStatus);

    return [
      `"${String(sale.invoiceNumber || '').replace(/"/g, '""')}"`,
      `"${dateFormatted}"`,
      `"${timeFormatted}"`,
      `"${(sale.customerName || 'Client Passager').replace(/"/g, '""')}"`,
      `"${String(sale.paymentMethod || 'especes').replace(/"/g, '""')}"`,
      `"${isPaid ? 'Payé' : isPartial ? 'Partiel' : 'Non Payé'}"`,
      `"${delivBadge.label}"`,
      `"${itemsSummary.replace(/"/g, '""')}"`,
      Math.round(sale.total || 0),
      Math.round(paidAmt),
      Math.round(dueAmt)
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Journal_Ventes_${tenantName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
