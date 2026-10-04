/**
 * Fenêtres d'historique (phase 3 — performance).
 *
 * Les collections qui grossissent sans limite (ventes, journaux, dépenses…) ne sont plus
 * écoutées en entier : seul l'historique récent est chargé (par défaut 1 an de ventes,
 * 90 jours de journal d'audit). L'historique plus ancien se charge à la demande.
 * Les ventes à crédit encore ouvertes restent toujours chargées, quelle que soit leur date.
 *
 * Module PUR (testable avec `node --test`).
 */

export interface HistoryCollectionConfig {
  /** Champ date (chaîne ISO) utilisé pour la fenêtre. */
  dateField: string;
  /** Profondeur par défaut, en jours. */
  defaultDays: number;
  label: string;
}

export const HISTORY_COLLECTIONS: Record<string, HistoryCollectionConfig> = {
  sales: { dateField: 'date', defaultDays: 365, label: 'Ventes' },
  payments: { dateField: 'date', defaultDays: 365, label: 'Encaissements' },
  returns: { dateField: 'date', defaultDays: 365, label: 'Retours' },
  transfers: { dateField: 'date', defaultDays: 365, label: 'Transferts de stock' },
  expenses: { dateField: 'date', defaultDays: 730, label: 'Dépenses' },
  auditLogs: { dateField: 'timestamp', defaultDays: 90, label: "Journal d'audit" },
  invoiceAuditLogs: { dateField: 'timestamp', defaultDays: 180, label: 'Journal des factures' },
  deliveryNoteAudit: { dateField: 'createdAt', defaultDays: 180, label: 'Journal des bons de livraison' },
  commissionAudit: { dateField: 'createdAt', defaultDays: 180, label: 'Journal des commissions' },
};

/** Statuts de crédit pour lesquels une vente reste chargée quelle que soit sa date. */
export const OPEN_CREDIT_STATUSES = ['Crédit actif', 'Crédit en retard'];

/** Profondeur choisie par collection : nombre de jours, ou null = historique complet. */
export type HistoryPreferences = Record<string, number | null>;

export function defaultHistoryPreferences(): HistoryPreferences {
  const prefs: HistoryPreferences = {};
  for (const [field, cfg] of Object.entries(HISTORY_COLLECTIONS)) prefs[field] = cfg.defaultDays;
  return prefs;
}

/** Date ISO de début de fenêtre (minuit UTC, stable sur la journée pour ne pas réabonner en continu). */
export function sinceIsoFor(days: number | null | undefined, now: Date = new Date()): string | null {
  if (days === null || days === undefined || !Number.isFinite(days) || days <= 0) return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - Math.floor(days));
  return start.toISOString();
}

/** Fenêtres effectives { champ du DBState -> date ISO de début | null }. */
export function resolveWindows(prefs: HistoryPreferences, now: Date = new Date()): Record<string, string | null> {
  const windows: Record<string, string | null> = {};
  for (const field of Object.keys(HISTORY_COLLECTIONS)) {
    const days = field in prefs ? prefs[field] : HISTORY_COLLECTIONS[field].defaultDays;
    windows[field] = sinceIsoFor(days, now);
  }
  return windows;
}

/** Fusionne plusieurs résultats de requêtes en dédoublonnant par identifiant (dernier gagnant). */
export function mergeById<T extends { id?: unknown }>(lists: T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (item && item.id != null) map.set(String(item.id), item);
    }
  }
  return Array.from(map.values());
}

const PREFS_KEY = 'nexastock_history_prefs';

export function loadHistoryPreferences(uid: string | null): HistoryPreferences {
  const defaults = defaultHistoryPreferences();
  if (!uid) return defaults;
  try {
    const raw = globalThis.localStorage?.getItem(`${PREFS_KEY}:${uid}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as HistoryPreferences;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveHistoryPreferences(uid: string | null, prefs: HistoryPreferences): void {
  if (!uid) return;
  try {
    globalThis.localStorage?.setItem(`${PREFS_KEY}:${uid}`, JSON.stringify(prefs));
  } catch { /* préférence facultative */ }
}
