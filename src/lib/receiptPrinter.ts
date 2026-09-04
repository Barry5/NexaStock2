import type { Sale } from '../types';
import { getDeliveryBadge } from '../services/posHistory';

export interface PrintReceiptOptions {
  sale: Sale;
  tenant?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxId?: string;
    currency?: string;
    receiptFooter?: string;
  };
  currency?: string;
  format?: '58mm' | '80mm' | 'A4';
}

/**
 * Generates an isolated, clean HTML document for printing receipts and invoices.
 * Designed specifically for thermal POS receipt printers (58mm, 80mm) and standard A4 printers.
 */
export function generateReceiptHtml({
  sale,
  tenant,
  currency = 'GNF',
  format = '80mm'
}: PrintReceiptOptions): string {
  const tenantName = tenant?.name || 'NexaStock POS';
  const tenantAddress = tenant?.address || '';
  const tenantPhone = tenant?.phone || '';
  const tenantEmail = tenant?.email || '';
  const tenantTaxId = tenant?.taxId || '';
  const footerMessage = tenant?.receiptFooter || 'MERCI DE VOTRE CONFIANCE !';

  const saleDate = new Date(sale.date);
  const formattedDate = !isNaN(saleDate.getTime())
    ? saleDate.toLocaleDateString('fr-FR') + ' ' + saleDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : sale.date;

  const paymentMethodLabel = (() => {
    switch (sale.paymentMethod as string) {
      case 'especes': return 'Espèces';
      case 'mobile_money': return 'Mobile Money';
      case 'carte': return 'Carte Bancaire';
      case 'virement': return 'Virement';
      case 'credit': return 'À Crédit';
      default: return String(sale.paymentMethod || 'Espèces');
    }
  })();

  const isPaid = sale.status === 'Payée' || sale.paymentStatus === 'Payé' || sale.paymentMethod !== 'credit';
  const isPartial = sale.status === 'Partiellement payée' || sale.paymentStatus === 'Partiellement payé';
  const statusLabel = isPaid ? 'PAYÉ (TOTAL)' : isPartial ? 'PARTIELLEMENT PAYÉ' : 'NON PAYÉ (CRÉDIT)';
  const deliveryBadge = getDeliveryBadge(sale.deliveryStatus);

  const paidAmount = sale.creditPaidAmount !== undefined ? sale.creditPaidAmount : (isPaid ? sale.total : 0);
  const remainingDue = Math.max(0, sale.total - paidAmount);

  // Thermal receipts (58mm and 80mm)
  if (format !== 'A4') {
    const is58 = format === '58mm';
    const paperWidth = is58 ? '48mm' : '72mm';
    const bodyWidth = is58 ? '46mm' : '70mm';
    const fontSize = is58 ? '10px' : '11.5px';
    const titleSize = is58 ? '13px' : '15px';

    const itemsRows = (sale.items || []).map((it) => {
      const pTotal = (it.total || it.quantity * it.price).toLocaleString();
      const pPrice = it.price.toLocaleString();
      return `
        <tr>
          <td colspan="3" class="item-name">${escapeHtml(it.productName)}</td>
        </tr>
        <tr class="item-calc-row">
          <td class="text-left text-muted pl-2">${it.quantity} x ${pPrice}</td>
          <td></td>
          <td class="text-right font-bold">${pTotal}</td>
        </tr>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Ticket ${sale.invoiceNumber}</title>
  <style>
    @page {
      size: ${format} auto;
      margin: 0;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: 'Courier New', Courier, monospace, -apple-system;
      font-size: ${fontSize};
      line-height: 1.25;
      width: ${paperWidth};
    }
    .ticket-container {
      width: ${bodyWidth};
      margin: 0 auto;
      padding: 3mm 1mm 8mm 1mm;
      background: #ffffff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
    .font-black { font-weight: 900; }
    .uppercase { text-transform: uppercase; }
    .text-muted { color: #333333; font-size: 0.9em; }
    .pl-2 { padding-left: 6px; }

    .header-title {
      font-size: ${titleSize};
      font-weight: 900;
      margin: 0 0 2px 0;
      letter-spacing: 0.5px;
    }
    .header-sub {
      font-size: 0.85em;
      margin: 1px 0;
      color: #222222;
    }
    .ticket-type {
      font-size: 0.8em;
      font-weight: bold;
      border: 1px solid #000;
      padding: 1px 4px;
      display: inline-block;
      margin-top: 3px;
      letter-spacing: 0.5px;
    }

    .dashed-line {
      border-top: 1px dashed #000000;
      margin: 4px 0;
      height: 0;
    }
    .double-line {
      border-top: 2px solid #000000;
      margin: 5px 0;
      height: 0;
    }

    .info-table {
      width: 100%;
      font-size: 0.9em;
      margin: 3px 0;
    }
    .info-table td {
      padding: 1px 0;
      vertical-align: top;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3px 0;
    }
    .items-table th {
      border-bottom: 1px dashed #000;
      font-weight: bold;
      padding: 2px 0;
      font-size: 0.85em;
    }
    .items-table td {
      padding: 1px 0;
      vertical-align: top;
    }
    .item-name {
      font-weight: bold;
      padding-top: 3px !important;
      word-break: break-word;
    }
    .item-calc-row td {
      padding-bottom: 3px;
    }

    .totals-table {
      width: 100%;
      margin: 4px 0;
      font-size: 0.95em;
    }
    .totals-table td {
      padding: 1.5px 0;
    }
    .grand-total {
      font-size: 1.25em;
      font-weight: 900;
    }

    .footer {
      text-align: center;
      margin-top: 6px;
      font-size: 0.8em;
      line-height: 1.3;
    }
    .feed-space {
      height: 15mm;
    }
  </style>
</head>
<body>
  <div class="ticket-container">
    <!-- Header -->
    <div class="text-center">
      <h1 class="header-title uppercase">${escapeHtml(tenantName)}</h1>
      ${tenantAddress ? `<div class="header-sub">${escapeHtml(tenantAddress)}</div>` : ''}
      ${tenantPhone ? `<div class="header-sub">Tél: ${escapeHtml(tenantPhone)}</div>` : ''}
      ${tenantTaxId ? `<div class="header-sub">NIF/RCCM: ${escapeHtml(tenantTaxId)}</div>` : ''}
      <div><span class="ticket-type">TICKET DE CAISSE</span></div>
    </div>

    <div class="dashed-line"></div>

    <!-- Metadata -->
    <table class="info-table">
      <tr>
        <td class="font-bold">N° Ticket :</td>
        <td class="text-right font-bold">${escapeHtml(sale.invoiceNumber)}</td>
      </tr>
      <tr>
        <td>Date :</td>
        <td class="text-right">${escapeHtml(formattedDate)}</td>
      </tr>
      <tr>
        <td>Caissier :</td>
        <td class="text-right">${escapeHtml(sale.employeeName || 'Caisse')}</td>
      </tr>
      <tr>
        <td>Client :</td>
        <td class="text-right font-bold">${escapeHtml(sale.customerName || 'Client Comptoir')}</td>
      </tr>
    </table>

    <div class="dashed-line"></div>

    <!-- Articles -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="text-left">Désignation</th>
          <th></th>
          <th class="text-right">Total (${escapeHtml(currency)})</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="dashed-line"></div>

    <!-- Totals -->
    <table class="totals-table">
      <tr>
        <td>Sous-total :</td>
        <td class="text-right">${(sale.subtotal || sale.total).toLocaleString()} ${escapeHtml(currency)}</td>
      </tr>
      ${sale.discount > 0 ? `
        <tr>
          <td>Remise :</td>
          <td class="text-right">-${sale.discount.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
      ` : ''}
      ${sale.taxRate && sale.taxRate > 0 ? `
        <tr>
          <td>TVA (${sale.taxRate}%) :</td>
          <td class="text-right">${sale.tax.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
      ` : ''}
      ${sale.extraFees && sale.extraFees > 0 ? `
        <tr>
          <td>${escapeHtml(sale.customFeeLabel || 'Frais')} :</td>
          <td class="text-right">${sale.extraFees.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
      ` : ''}
      ${sale.deliveryFee && sale.deliveryFee > 0 ? `
        <tr>
          <td>Livraison :</td>
          <td class="text-right">${sale.deliveryFee.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
      ` : ''}
      <tr>
        <td colspan="2"><div class="double-line"></div></td>
      </tr>
      <tr class="grand-total font-black">
        <td>TOTAL :</td>
        <td class="text-right">${sale.total.toLocaleString()} ${escapeHtml(currency)}</td>
      </tr>
    </table>

    <div class="dashed-line"></div>

    <!-- Payment details -->
    <table class="info-table">
      <tr>
        <td>Mode Règlement :</td>
        <td class="text-right font-bold">${escapeHtml(paymentMethodLabel)}</td>
      </tr>
      <tr>
        <td>Statut Paiement :</td>
        <td class="text-right font-bold">${escapeHtml(statusLabel)}</td>
      </tr>
      <tr>
        <td>Livraison :</td>
        <td class="text-right font-bold" style="color: ${deliveryBadge.colorHex};">${escapeHtml(deliveryBadge.label)}</td>
      </tr>
      ${sale.paymentMethod === 'credit' || isPartial ? `
        <tr>
          <td>Montant Réglé :</td>
          <td class="text-right">${paidAmount.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
        <tr>
          <td class="font-bold">Reste à Payer :</td>
          <td class="text-right font-bold">${remainingDue.toLocaleString()} ${escapeHtml(currency)}</td>
        </tr>
      ` : ''}
    </table>

    <div class="dashed-line"></div>

    <!-- Footer -->
    <div class="footer">
      <div class="font-bold uppercase">${escapeHtml(footerMessage)}</div>
      <div style="font-size: 0.85em; color: #555; margin-top: 3px;">Logiciel de Caisse NexaStock ERP</div>
    </div>

    <!-- Thermal Paper Cut Spacing -->
    <div class="feed-space"></div>
  </div>
</body>
</html>`;
  }

  // Official A4 Format
  const itemsA4 = (sale.items || []).map((it, idx) => `
    <tr style="border-bottom: 1px solid #e5e7eb; background: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
      <td style="padding: 10px 12px; font-weight: bold; color: #111827;">${escapeHtml(it.productName)}</td>
      <td style="padding: 10px 12px; text-align: center;">${it.quantity}</td>
      <td style="padding: 10px 12px; text-align: right;">${it.price.toLocaleString()}</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: bold;">${(it.total || it.quantity * it.price).toLocaleString()}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Facture ${sale.invoiceNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 15mm 15mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
    }
    .invoice-wrapper {
      max-width: 800px;
      margin: 0 auto;
      padding: 10px;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .header-table td {
      vertical-align: top;
    }
    .company-title {
      font-size: 22px;
      font-weight: 900;
      color: #1e3a8a;
      text-transform: uppercase;
      margin: 0 0 4px 0;
    }
    .invoice-badge {
      text-align: right;
    }
    .invoice-num {
      font-size: 18px;
      font-weight: bold;
      color: #2563eb;
      font-family: monospace;
      margin: 2px 0;
    }
    .details-grid {
      width: 100%;
      margin-bottom: 24px;
      border-collapse: separate;
      border-spacing: 12px 0;
    }
    .card-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      vertical-align: top;
    }
    .card-title {
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px 0;
    }
    .items-table th {
      background: #1e293b;
      color: #ffffff;
      padding: 10px 12px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .totals-area {
      width: 100%;
      margin-top: 16px;
    }
    .totals-box {
      width: 320px;
      margin-left: auto;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
    }
    .totals-box table {
      width: 100%;
    }
    .totals-box td {
      padding: 4px 0;
    }
    .total-ttc {
      font-size: 16px;
      font-weight: 900;
      color: #1e3a8a;
      border-top: 2px solid #2563eb;
      padding-top: 8px !important;
    }
    .footer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 11px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td>
          <h1 class="company-title">${escapeHtml(tenantName)}</h1>
          ${tenantAddress ? `<div>${escapeHtml(tenantAddress)}</div>` : ''}
          ${tenantPhone ? `<div>Tél: ${escapeHtml(tenantPhone)}</div>` : ''}
          ${tenantEmail ? `<div>Email: ${escapeHtml(tenantEmail)}</div>` : ''}
          ${tenantTaxId ? `<div>NIF/RCCM: ${escapeHtml(tenantTaxId)}</div>` : ''}
        </td>
        <td class="invoice-badge">
          <div style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase;">FACTURE DE VENTE</div>
          <div class="invoice-num">${escapeHtml(sale.invoiceNumber)}</div>
          <div style="font-size: 12px; color: #4b5563;">Date: ${escapeHtml(formattedDate)}</div>
          <div style="font-size: 12px; color: #4b5563;">Caissier: ${escapeHtml(sale.employeeName || 'Comptoir')}</div>
        </td>
      </tr>
    </table>

    <!-- Info Cards -->
    <table class="details-grid">
      <tr>
        <td class="card-box" style="width: 50%;">
          <div class="card-title">Facturé à</div>
          <div style="font-size: 14px; font-weight: bold; color: #111827;">${escapeHtml(sale.customerName || 'Client Comptoir')}</div>
          ${sale.customerId ? `<div style="font-size: 11px; color: #64748b;">ID Client: ${escapeHtml(sale.customerId)}</div>` : ''}
        </td>
        <td class="card-box" style="width: 50%;">
          <div class="card-title">Modalités de Paiement & Suivi</div>
          <div>Mode : <strong>${escapeHtml(paymentMethodLabel)}</strong></div>
          <div>Statut Règlement : <strong style="color: ${isPaid ? '#059669' : '#d97706'};">${escapeHtml(statusLabel)}</strong></div>
          <div>Livraison : <strong style="color: ${deliveryBadge.colorHex};">${escapeHtml(deliveryBadge.label)}</strong></div>
        </td>
      </tr>
    </table>

    <!-- Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: left;">Désignation</th>
          <th style="text-align: center; width: 80px;">Quantité</th>
          <th style="text-align: right; width: 140px;">Prix Unitaire (${escapeHtml(currency)})</th>
          <th style="text-align: right; width: 150px;">Total (${escapeHtml(currency)})</th>
        </tr>
      </thead>
      <tbody>
        ${itemsA4}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-area">
      <div class="totals-box">
        <table>
          <tr>
            <td>Sous-total :</td>
            <td style="text-align: right; font-weight: 600;">${(sale.subtotal || sale.total).toLocaleString()} ${escapeHtml(currency)}</td>
          </tr>
          ${sale.discount > 0 ? `
            <tr>
              <td style="color: #dc2626;">Remise :</td>
              <td style="text-align: right; color: #dc2626; font-weight: 600;">-${sale.discount.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
          ` : ''}
          ${sale.taxRate && sale.taxRate > 0 ? `
            <tr>
              <td>TVA (${sale.taxRate}%) :</td>
              <td style="text-align: right; font-weight: 600;">${sale.tax.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
          ` : ''}
          ${sale.extraFees && sale.extraFees > 0 ? `
            <tr>
              <td>${escapeHtml(sale.customFeeLabel || 'Frais')} :</td>
              <td style="text-align: right; font-weight: 600;">${sale.extraFees.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
          ` : ''}
          ${sale.deliveryFee && sale.deliveryFee > 0 ? `
            <tr>
              <td>Frais de livraison :</td>
              <td style="text-align: right; font-weight: 600;">${sale.deliveryFee.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
          ` : ''}
          <tr class="total-ttc">
            <td>TOTAL :</td>
            <td style="text-align: right;">${sale.total.toLocaleString()} ${escapeHtml(currency)}</td>
          </tr>
          ${sale.paymentMethod === 'credit' || isPartial ? `
            <tr>
              <td style="padding-top: 6px; color: #059669;">Montant Réglé :</td>
              <td style="text-align: right; padding-top: 6px; font-weight: bold; color: #059669;">${paidAmount.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
            <tr>
              <td style="color: #d97706; font-weight: bold;">Reste Dû :</td>
              <td style="text-align: right; font-weight: bold; color: #d97706;">${remainingDue.toLocaleString()} ${escapeHtml(currency)}</td>
            </tr>
          ` : ''}
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="font-weight: bold; margin-bottom: 4px;">${escapeHtml(footerMessage)}</p>
      <p style="margin: 0;">Facture générée par le système NexaStock Multi-tenant ERP</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Triggers the browser print dialog for ONLY the specified receipt or invoice.
 * Uses an isolated off-screen iframe to prevent printing the web app UI (sidebars,
 * headers, navigation, or buttons).
 */
export function printReceipt(options: PrintReceiptOptions): void {
  const html = generateReceiptHtml(options);

  try {
    // Remove any previous print iframe to avoid duplicate instances
    const existingIframe = document.getElementById('pos-isolated-print-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'pos-isolated-print-iframe';
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
      throw new Error('Unable to access iframe document');
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Wait for DOM & font rendering inside the iframe before opening the print dialog
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printErr) {
        console.warn('Iframe print failed, falling back to window.open print', printErr);
        fallbackWindowPrint(html);
      }

      // Cleanup after print dialog
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {
          // Ignore cleanup errors
        }
      }, 60000);
    }, 250);
  } catch (err) {
    console.warn('Error during receipt printing:', err);
    fallbackWindowPrint(html);
  }
}

function fallbackWindowPrint(html: string): void {
  try {
    const printWin = window.open('', '_blank', 'width=450,height=600');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 300);
    } else {
      window.print();
    }
  } catch {
    window.print();
  }
}
