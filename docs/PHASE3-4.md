# NexaStock — Phases 3 et 4 de l'audit (performance et observabilité)

Branche : `phase3-4-performance-observabilite`, construite sur `phase1-securite` (les phases 1-2 sont un prérequis : voir `docs/PHASE1-2.md`).

## 1. Ce qui change

### Phase 3 — performance

| ID | Correction | Fichiers |
| --- | --- | --- |
| PERF-01 | **Fenêtres d'historique** : ventes, encaissements, retours, transferts (1 an), dépenses (2 ans), journaux (90 à 180 jours). Les ventes à crédit encore ouvertes restent toujours chargées. L'historique ancien se charge à la demande | `src/sync/historyWindow.ts`, `src/lib/firebaseSync.ts`, `src/context/DBContext.tsx` |
| PERF-01 | Les rapports (export des ventes, PDF du tableau de bord) étendent automatiquement la période chargée, le temps de la session | `SalesReportExportModal.tsx`, `Dashboard.tsx` |
| PERF-01 | Index composites `tenantId + date` déclarés | `firestore.indexes.json` |
| PERF-02 | Instantané JSON complet désactivé quand le cache Firestore persistant est actif ; enregistrement des objets connus limité aux tableaux modifiés | `DBContext.tsx` |
| OFF-01 | **Pré-cache PWA du build complet** : un plugin Vite injecte dans `dist/sw.js` la liste de tous les fichiers produits ; navigation réseau d'abord (4 s) puis cache ; `/assets/*` cache d'abord ; mise à jour activée à la demande de l'utilisateur ; images Cloud Storage mises en cache | `vite.config.ts`, `public/sw.js`, `vercel.json` |
| SYNC-04 | **Images dans Cloud Storage** : seule l'URL est enregistrée dans le produit / la boutique. Hors ligne ou en cas d'échec, l'image compressée reste dans le document (repli automatique) | `src/lib/imageStorage.ts`, `storage.rules`, `ProductFormModal.tsx`, `SaaSSettings.tsx` |

### Phase 4 — observabilité

| ID | Correction | Fichiers |
| --- | --- | --- |
| OBS-01 | **Panneau « État de la synchronisation »** (clic sur l'indicateur de l'en-tête, ordinateur et mobile) : en attente, envoyées sans accusé, file morte, dernier accusé et délai moyen, persistance hors ligne, réglage de l'historique chargé | `src/components/sync/SyncStatusPanel.tsx`, `Header.tsx`, `App.tsx` |
| OBS-01 | **File morte gérable** : rejouer ou abandonner chaque opération refusée ; chaque action est tracée | `SyncStatusPanel.tsx`, `DBContext.tsx` |
| OBS-01 | **Télémétrie centrale** : `deviceStatus/{poste}_{compte}` (état de la file, connexion, dernier signe de vie, version), publié toutes les 5 min ou à chaque changement significatif ; `syncEvents` (file morte, refus des règles, erreurs d'écoute, quarantaine, actions manuelles), en ajout seul | `src/lib/telemetry.ts`, `src/api/sync.ts`, `DBContext.tsx`, `firestore.rules` |
| OBS-01 | **Alertes calculées** : file morte (critique), poste muet depuis plus de 24 h avec des opérations non synchronisées (critique), synchronisation bloquée depuis plus de 30 min (avertissement), navigateur sans stockage persistant, refus des règles groupés par boutique, quarantaine | `src/sync/monitoring.ts` |
| OBS-01 | **Console super admin** : synthèse par boutique, détail par poste, derniers événements, alertes en temps réel | `src/components/admin/DeviceMonitor.tsx`, `AdminSyncOverview.tsx` |
| OBS-02 | Indicateur de l'en-tête branché sur l'état réel (en ligne / dégradé / hors ligne, nombre d'opérations en attente et en file morte) | `Header.tsx` |

Qui voit quoi : tout utilisateur voit l'état de SON poste ; propriétaires et administrateurs voient aussi les alertes de leur boutique ; le super admin voit toute la plateforme.

## 2. Mise en production

Prérequis : phases 1-2 déployées (comptes Firebase Auth migrés, règles en place).

1. **Index** : `npx firebase-tools deploy --only firestore:indexes` puis attendre la fin de leur construction (console Firebase > Firestore > Index). Sans eux, les écrans affichent « Index Firestore manquant » et les listes fenêtrées restent vides.
2. **Cloud Storage** : activer Storage dans la console Firebase. Selon la date de création du projet, Cloud Storage peut exiger le forfait Blaze ; sans Storage, l'envoi échoue et les images restent compressées dans les documents (aucune perte).
3. **Règles** : `npm run deploy:rules` (Firestore + Storage).
4. **Code** : `npm run build` (le build affiche `[precache] N fichiers, version …`), puis déploiement. Les en-têtes de `vercel.json` empêchent la mise en cache de `sw.js` et rendent `/assets/*` immuables.
5. **Contrôles** :
   - charger l'application, puis couper le réseau et la recharger : elle doit démarrer ;
   - ouvrir l'état de la synchronisation, faire une vente hors ligne : « En attente » augmente, puis revient à 0 au retour du réseau ;
   - console super admin > Synchronisation : chaque poste connecté apparaît en moins de 5 minutes.

## 3. Tests

```bash
npm run test:unit   # 23 tests : moteur de changements, fenêtres d'historique, alertes
npm run test:rules  # émulateur : règles phases 1-2 + télémétrie
```

## 4. Limites connues

- Les règles Storage ne peuvent pas vérifier l'appartenance à une boutique (la base Firestore est nommée, ce que les règles Storage ne savent pas lire) : envoi réservé aux utilisateurs connectés, images uniquement, 1 Mo maximum, aucun remplacement ni suppression.
- Les écrans qui calculent des totaux « depuis toujours » (hors rapports) ne voient que la fenêtre chargée ; régler « Tout » dans le panneau d'historique si nécessaire.
- La télémétrie est publiée par les postes eux-mêmes : un poste jamais reconnecté ne publie plus (il apparaît « muet », ce qui est justement l'alerte).
- Aucune notification hors application (e-mail, SMS) : nécessiterait une Cloud Function planifiée (piste pour la phase 5).
