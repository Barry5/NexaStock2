/**
 * Numérotation des tickets et factures (SYNC-08, phase 2).
 *
 * - À l'encaissement (hors ligne compris) : numéro PROVISOIRE unique par poste
 *   (`TK-261003-P3F9A21-0007`), sans risque de collision entre postes.
 * - Dès que le serveur est joignable : numéro DÉFINITIF séquentiel par boutique, préfixe
 *   et année (`TK-2026-000042`), attribué dans une transaction Firestore sur un compteur.
 *   Le numéro provisoire est conservé dans `provisionalNumber` (traçabilité du ticket imprimé).
 */
import { doc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from './firebase';
import { getDeviceId } from './ids';

const SEQ_KEY = 'nexastock_provisional_seq';

function yymmdd(d: Date): string {
  return d.toISOString().slice(2, 10).replace(/-/g, '');
}

export function provisionalInvoiceNumber(prefix: string, now: Date = new Date()): string {
  const device = getDeviceId().replace(/[^a-f0-9]/gi, '').slice(-6).toUpperCase() || 'XXXXXX';
  const day = yymmdd(now);
  let seq = 1;
  try {
    const raw = localStorage.getItem(SEQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day: string; seq: number }) : null;
    seq = parsed && parsed.day === day ? parsed.seq + 1 : 1;
    localStorage.setItem(SEQ_KEY, JSON.stringify({ day, seq }));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1000;
  }
  return `${prefix}-${day}-P${device}-${String(seq).padStart(4, '0')}`;
}

export function invoicePrefixOf(numberValue: string | undefined): string {
  const prefix = (numberValue || '').split('-')[0];
  return prefix && /^[A-Z]{2,5}$/.test(prefix) ? prefix : 'FAC';
}

/**
 * Attribue le numéro définitif d'une vente déjà présente sur le serveur.
 * Retourne null si la vente n'est pas encore arrivée sur le serveur (nouvel essai plus tard).
 */
export async function finalizeInvoiceNumber(params: { tenantId: string; saleId: string; prefix: string; year?: number }): Promise<string | null> {
  const year = params.year ?? new Date().getFullYear();
  const counterId = `${params.tenantId}_${params.prefix}_${year}`;
  const counterRef = doc(db, 'counters', counterId);
  const saleRef = doc(db, 'sales', params.saleId);
  return runTransaction(db, async tx => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) return null;
    const sale = saleSnap.data() as { invoiceNumber?: string; numberStatus?: string; tenantId?: string };
    if (sale.numberStatus !== 'provisional') return sale.invoiceNumber ?? null;
    if (sale.tenantId !== params.tenantId) return null;
    const counterSnap = await tx.get(counterRef);
    const last = counterSnap.exists() ? Number((counterSnap.data() as { last?: number }).last || 0) : 0;
    const next = last + 1;
    const finalNumber = `${params.prefix}-${year}-${String(next).padStart(6, '0')}`;
    if (counterSnap.exists()) tx.update(counterRef, { last: next });
    else tx.set(counterRef, { last: next, tenantId: params.tenantId, prefix: params.prefix, year });
    tx.update(saleRef, {
      invoiceNumber: finalNumber,
      provisionalNumber: sale.invoiceNumber ?? null,
      numberStatus: 'final',
      numberAssignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: increment(1),
    });
    return finalNumber;
  });
}
