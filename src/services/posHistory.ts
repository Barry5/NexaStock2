import { computeGlobalStatus } from '../components/pos/posUtils';

export interface SaleDisplayState {
  invoiceStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  creditStatus: string;
  globalStatus: string;
}

export function isDeliveryDelivered(status?: string | null): boolean {
  if (!status) return true;
  const s = String(status).toLowerCase().trim();
  return s === 'livrée' || s === 'livree' || s === 'livré' || s === 'livre' || s === 'livre_total' || s === 'fully_delivered' || s === 'delivered';
}

export function normalizeDeliveryStatus(rawStatus?: string | null): 'Non livrée' | 'Partiellement livrée' | 'Livrée' | 'Retournée' {
  if (!rawStatus) return 'Livrée';
  const s = String(rawStatus).toLowerCase().trim();
  if (s === 'non livrée' || s === 'non livree' || s === 'non_livré' || s === 'non_livre' || s === 'non livré' || s === 'non livre') {
    return 'Non livrée';
  }
  if (s.includes('partiel')) {
    return 'Partiellement livrée';
  }
  if (s.includes('retour')) {
    return 'Retournée';
  }
  if (isDeliveryDelivered(s)) {
    return 'Livrée';
  }
  return 'Non livrée';
}

export function getDeliveryBadge(status?: string | null) {
  const normalized = normalizeDeliveryStatus(status);
  switch (normalized) {
    case 'Livrée':
      return {
        normalized,
        label: 'LIVRÉE',
        display: 'Livrée',
        bgClass: 'bg-emerald-100 text-emerald-800',
        colorHex: '#059669',
      };
    case 'Partiellement livrée':
      return {
        normalized,
        label: 'PARTIELLEMENT LIVRÉE',
        display: 'Partiellement livrée',
        bgClass: 'bg-amber-100 text-amber-800',
        colorHex: '#d97706',
      };
    case 'Retournée':
      return {
        normalized,
        label: 'RETOURNÉE',
        display: 'Retournée',
        bgClass: 'bg-purple-100 text-purple-800',
        colorHex: '#7c3aed',
      };
    case 'Non livrée':
    default:
      return {
        normalized,
        label: 'NON LIVRÉE',
        display: 'Non livrée',
        bgClass: 'bg-red-100 text-red-800',
        colorHex: '#dc2626',
      };
  }
}

export function filterSalesHistory(sales: any[], historySearch: string, historyFilterStatus: string) {
  const normalizedSearch = historySearch.toLowerCase().trim();
  return sales.filter(sale => {
    const matchText = !normalizedSearch || [sale.invoiceNumber, sale.customerName || '']
      .some(value => value.toLowerCase().includes(normalizedSearch));
    const statusValue = sale.status || 'Payée';
    const matchStatus = historyFilterStatus === 'Tous' || statusValue === historyFilterStatus;
    return matchText && matchStatus;
  });
}

export function getSaleDisplayState(sale: any): SaleDisplayState {
  const statusValue = sale.status || 'Payée';
  const invoiceStatus = sale.invoiceStatus || (statusValue === 'Brouillon' ? 'Brouillon' : 'Validée');
  const paymentStatus = sale.paymentStatus || (sale.isReturned ? 'Remboursé' : (statusValue === 'Payée' ? 'Payé' : (statusValue === 'Partiellement payée' ? 'Partiellement payé' : 'Non payé')));
  const deliveryStatus = normalizeDeliveryStatus(sale.deliveryStatus);
  const creditStatus = sale.creditStatus || (sale.paymentMethod === 'credit' ? (((sale as any).creditPaidAmount || 0) >= sale.total ? 'Crédit soldé' : 'Crédit actif') : 'Pas de crédit');
  const globalStatus = computeGlobalStatus({
    ...sale,
    invoiceStatus,
    paymentStatus,
    deliveryStatus,
    creditStatus,
  });

  return {
    invoiceStatus,
    paymentStatus,
    deliveryStatus,
    creditStatus,
    globalStatus,
  };
}
