import { lazy, type ComponentType } from 'react';

/**
 * Robust wrapper around React.lazy that handles chunk loading errors
 * (e.g. after a new deployment when old chunk hashes no longer exist on the server).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string
) {
  return lazy(async () => {
    const storageKey = `retry_chunk_${chunkName || 'default'}`;
    try {
      const module = await factory();
      // On success, clear any previous retry flags
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // ignore storage errors
      }
      return module;
    } catch (error: any) {
      console.warn(`[lazyWithRetry] Error loading chunk ${chunkName || ''}:`, error);

      const isChunkLoadError =
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Expected a JavaScript-or-Wasm module script') ||
        error?.message?.includes('Strict MIME type checking') ||
        error?.message?.includes('error loading dynamically imported module');

      let hasRetried = false;
      try {
        hasRetried = !!sessionStorage.getItem(storageKey);
      } catch {
        // ignore
      }

      if (isChunkLoadError && !hasRetried) {
        try {
          sessionStorage.setItem(storageKey, 'true');
          // If a service worker is registered, request an update
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
              for (const r of registrations) {
                r.update().catch(() => {});
              }
            });
          }
        } catch {
          // ignore
        }

        // Force a reload from server to fetch the latest index.html and chunk hashes
        window.location.reload();
        // Return a promise that never settles while the page is reloading
        return new Promise<{ default: T }>(() => {});
      }

      // If we already retried once or it's another error, throw it so ErrorBoundary can handle it
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      throw error;
    }
  });
}
