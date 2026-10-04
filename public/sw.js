/*
 * Service worker NexaStock — phase 3 (OFF-01 : démarrage hors ligne).
 *
 * Au build, le plugin Vite `nexastock-precache-manifest` remplace BUILD_ID et la liste
 * PRECACHE_URLS par l'ensemble des fichiers produits (bundles, chunks paresseux, icônes).
 * Tout est mis en cache à l'installation : l'application démarre sans réseau.
 *
 * - Navigation : réseau d'abord (4 s), puis index.html en cache, puis offline.html.
 * - /assets/* (fichiers hachés, immuables) : cache d'abord.
 * - Autres fichiers du même domaine : cache puis mise à jour en arrière-plan.
 * - Domaines tiers (Firestore, Google APIs) : jamais interceptés.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE_URLS = /*__PRECACHE_MANIFEST__*/[];
const PRECACHE = `nexastock-precache-${BUILD_ID}`;
const RUNTIME = 'nexastock-runtime';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const urls = Array.from(new Set([...SHELL, ...PRECACHE_URLS]));
    // Ajout fichier par fichier : un échec isolé n'empêche pas l'installation.
    const results = await Promise.allSettled(urls.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) console.warn(`[SW] ${failed}/${urls.length} fichier(s) non mis en cache.`);
  })());
  // Pas de skipWaiting automatique : la nouvelle version s'active quand l'utilisateur l'accepte
  // (message SKIP_WAITING), pour ne pas mélanger anciens et nouveaux fichiers dans une page ouverte.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function handleNavigation(request) {
  try {
    const response = await Promise.race([fetch(request), timeout(4000)]);
    if (response && response.ok) {
      const cache = await caches.open(PRECACHE);
      cache.put('/index.html', response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || (await caches.match('/offline.html'))
      || new Response('Hors connexion', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Réponses opaques (images d'un autre domaine chargées sans CORS) : mises en cache aussi.
  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) {
      caches.open(RUNTIME).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
    }
    return response;
  }).catch(() => undefined);
  return cached || (await network) || new Response('Hors connexion', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Images Cloud Storage (produits, logos) : cache d'abord, pour l'affichage hors ligne.
  if (url.hostname === 'firebasestorage.googleapis.com' && request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return; // Firestore, Auth, Google APIs : réseau direct
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
