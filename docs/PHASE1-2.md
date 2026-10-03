# NexaStock — Phases 1 et 2 de l'audit (sécurité et fiabilisation de la synchronisation)

Branche : `phase1-securite`. Référence : rapport « Audit technique NexaStock2 — Synchronisation locale ↔ centrale » (identifiants SEC-xx, SYNC-xx, OBS-xx, OPS-xx).

> **À lire avant tout déploiement.** Les nouvelles règles Firestore et la nouvelle connexion
> (Firebase Auth) sont liées : déployer le code sans exécuter la migration bloque tous les
> utilisateurs existants ; déployer les règles sans le code bloque l'ancienne application.
> Suivre l'ordre de la section « Mise en production ».

## 1. Ce qui change

### Phase 1 — corrections critiques

| ID | Correction | Fichiers |
| --- | --- | --- |
| SEC-01 | Règles Firestore « refus par défaut », lecture/écriture limitées à la boutique de l'utilisateur, super admin global | `firestore.rules` |
| SEC-02 | Connexion par Firebase Auth (e-mail / mot de passe). Plus aucun mot de passe dans Firestore ni comparé dans le navigateur. Session issue du compte Auth (plus de session falsifiable dans `localStorage`). Création de collaborateurs par un compte Auth dédié ; réinitialisation par e-mail | `src/lib/authService.ts`, `src/context/AuthContext.tsx`, `src/context/AppContext.tsx`, `SaaSAuth.tsx`, `UserManagement.tsx`, `SaaSSettings.tsx`, `SaaSAdmin.tsx`, `UserProfileModal.tsx`, `App.tsx` |
| SEC-03 | Suppression du compte super admin codé en dur et de la création automatique de comptes / boutiques par défaut | `src/lib/firebaseSync.ts` |
| SEC-04 | Aucune suppression physique par une boutique ; journaux en ajout seul ; rôles vérifiés par les règles | `firestore.rules` |
| SEC-05 | Bouton « Bypass Démo » retiré ; statut d'abonnement modifiable uniquement vers « PENDING » par une boutique | `App.tsx`, `firestore.rules` |
| SEC-06 | Chaque poste ne reçoit que sa boutique ; cache d'affichage par utilisateur, purgé à la déconnexion ; l'ancien cache global est supprimé | `DBContext.tsx`, `storage.ts` |
| SYNC-01 / SYNC-12 / SYNC-18 | Fin de la « résurrection » : plus jamais de données renvoyées au serveur à partir du cache local. Les anciens enregistrements locaux absents du serveur sont mis en **quarantaine** (`syncQuarantine`) pour examen | `DBContext.tsx` |
| SYNC-03 | Cache Firestore persistant multi-onglets ; opérations envoyées sans accusé remises en file au démarrage | `src/lib/firebase.ts`, `src/lib/syncQueue.ts` |
| SYNC-04 | Une opération = un lot : un document invalide ne bloque plus les autres ; file morte visible ; images compressées (< 1 Mio) | `src/api/sync.ts`, `src/lib/imageCompression.ts` |
| SYNC-07 | Création rapide de client au POS par le flux de synchronisation | `usePOSState.ts` |
| SYNC-09 | Identifiants UUID partout (plus de `Date.now()` ni de suffixe aléatoire court) | `src/lib/ids.ts` + composants |
| SYNC-14 | Le caissier d'une vente est l'utilisateur connecté | `usePOSState.ts` |
| OPS-01 | Sauvegardes / restaurations / contrôle de cohérence simulés supprimés : message explicite d'indisponibilité | `src/api/admin.ts` |
| OBS-01 / OBS-02 | Journaux fabriqués supprimés ; tableau de bord et bouton « Synchroniser » branchés sur la file réelle | `syncLogger.ts`, `api/sync.ts`, `Header.tsx`, `AdminSyncOverview.tsx` |

### Phase 2 — fiabilisation de la synchronisation

| ID | Correction | Fichiers |
| --- | --- | --- |
| SYNC-05 / SYNC-06 | Nouveau moteur de changements : diff **champ par champ**, aucune suppression déduite d'une absence, objets non modifiés jamais renvoyés, application à l'état courant sans l'écraser | `src/sync/changeEngine.ts`, `DBContext.tsx` |
| SYNC-02 | Stock (`products.quantity`), dette et points clients envoyés en **incréments** ; mouvement `stockMovements/{opId}` à chaque variation ; incrément jamais appliqué deux fois (`operations/{opId}` + règles) | `changeEngine.ts`, `firebaseSync.ts`, `firestore.rules` |
| — | Paiements, retours, remboursements ajoutés en `arrayUnion` : deux encaissements concurrents sont conservés | `changeEngine.ts` |
| SYNC-01 / SYNC-11 | Suppressions **explicites et logiques** (`deletedAt`), propagées à tous les postes par les écouteurs | `DBContext.handleDeleteRecords`, composants |
| SYNC-10 | Ordre garanti par enregistrement, backoff exponentiel, `version` incrémentée côté serveur | `syncQueue.ts`, `firebaseSync.ts` |
| SYNC-08 | Numéro provisoire unique par poste à l'encaissement, puis numéro **définitif séquentiel** par boutique / préfixe / année attribué en transaction | `src/lib/invoiceNumbering.ts`, `DBContext.tsx` |
| TIME-01 | `updatedAt`, `serverCreatedAt` en `serverTimestamp()` ; auteur, poste et `lastOperationId` sur chaque écriture | `firebaseSync.ts` |
| SYNC-16 / SYNC-19 | Verrou inter-onglets (Web Locks) ; envoi immédiat (y compris hors ligne : le SDK conserve l'écriture) ; état « dégradé » si le serveur ne répond pas depuis 60 s | `api/sync.ts`, `DBContext.tsx` |
| PERF-01 | Plus de rechargement complet toutes les 30 s : écouteurs bornés à la boutique uniquement | `firebaseSync.ts`, `DBContext.tsx` |

### Non traité (décision ou phase ultérieure)

- **ARCH-01** : les modules Facturation, Bons de livraison, Admin SaaS (création de boutique), RBAC et IA appellent toujours des routes `/api/*` absentes du dépôt. Décision attendue : backend existant hors dépôt, Cloud Functions, ou suppression.
- Machines à états des statuts (livraison, facture) côté règles : non implémentées.
- Restauration Google Drive : ne réactive pas un enregistrement supprimé logiquement.
- Limites de forfait et dates d'essai : toujours calculées côté client (une Cloud Function est nécessaire pour les rendre infalsifiables).
- Images toujours stockées dans les documents (compressées) ; Cloud Storage prévu en phase 3.
- Pré-cache PWA complet pour le démarrage à froid hors ligne (OFF-01) : phase 3.

## 2. Mise en production (ordre impératif)

1. **Sauvegarde** : export complet de la base Firestore (Console Google Cloud > Firestore > Import/Export, ou `gcloud firestore export gs://<bucket> --database=<id>`). Vérifier la restauration dans un projet de test.
2. **Firebase Auth** : Console Firebase > Authentication > activer le fournisseur « E-mail / Mot de passe ». Personnaliser le modèle d'e-mail de réinitialisation (français).
3. **Changer le mot de passe du compte super admin** existant (ses identifiants étaient dans le code public).
4. **Migration** (simulation puis écriture) :
   ```bash
   npm install --no-save firebase-admin
   node scripts/migrate-auth.mjs --credentials ./service-account.json          # simulation
   node scripts/migrate-auth.mjs --credentials ./service-account.json --apply  # écriture
   ```
   Le script crée les comptes Auth (mots de passe aléatoires), les liens `authLinks`, supprime les champs `password`, complète `tenantId` des variantes et journaux de facture, et produit `migration-output/reset-links-*.csv` (**sensible**) : un lien de réinitialisation par utilisateur, à transmettre individuellement. Corriger les documents signalés « sans tenantId ».
5. **Vider les files locales** : avant la mise à jour, demander à chaque poste de se connecter en ligne avec l'ancienne version et d'attendre la fin de la synchronisation. (Les opérations restantes sont reprises par la nouvelle version, mais celles qui contiennent des données d'autres boutiques seront refusées par les règles et iront en file morte.)
6. **Déployer le code** (`npm run build`, puis hébergement habituel).
7. **Déployer les règles** : `npx firebase-tools deploy --only firestore` (le fichier `firebase.json` cible la base nommée de la configuration).
8. **Contrôles** : connexion de chaque rôle, vente sur deux postes, suppression, tableau de bord de synchronisation (aucune opération en file morte), collection `syncQuarantine` (examen des enregistrements mis en quarantaine).

Retour arrière : redéployer l'ancienne version ET les anciennes règles ensemble (les comptes Auth et `authLinks` créés ne gênent pas l'ancienne version, mais les mots de passe ont été retirés des fiches : la réinitialisation par lien reste nécessaire).

## 3. Tests

```bash
npm run test:unit    # moteur de changements (aucune dépendance, Node 22+)

# Règles Firestore (émulateur) — prérequis une fois :
npm install -D vitest @firebase/rules-unit-testing firebase-tools
npm run test:rules
```

Couverture : `tests/unit/changeEngine.test.ts` (incréments, arrayUnion, absence de suppression implicite, objets périmés), `tests/rules/firestore.rules.test.ts` (T-01 à T-03, idempotence des incréments, inscription).

## 4. Points d'attention pour les utilisateurs

- Mot de passe : 8 caractères minimum. Première connexion d'un compte créé par un administrateur : changement imposé.
- Un administrateur ne choisit plus le mot de passe d'un collaborateur existant : il envoie un lien de réinitialisation.
- Créer un collaborateur nécessite Internet (création du compte Auth).
- Hors ligne : la caisse fonctionne avec une session déjà ouverte ; une **première** connexion nécessite Internet.
- Les tickets encaissés hors ligne portent un numéro provisoire (`TK-AAMMJJ-P<poste>-0001`) remplacé par le numéro définitif (`TK-2026-000123`) dès le retour du réseau ; le numéro provisoire reste visible dans `provisionalNumber`.
- La suppression d'un produit, client, fournisseur, dépense ou prêt est réservée aux rôles propriétaire, administrateur et gérant.
