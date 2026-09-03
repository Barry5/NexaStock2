import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<Props> {
  state = { hasError: false, error: null as Error | null, isChunkError: false };

  static getDerivedStateFromError(error: Error) {
    const msg = error?.message || '';
    const isChunk =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Expected a JavaScript-or-Wasm module script') ||
      msg.includes('MIME type of "text/html"') ||
      msg.includes('error loading dynamically imported module');

    return { hasError: true, error, isChunkError: isChunk };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    const msg = error?.message || '';
    const isChunk =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Expected a JavaScript-or-Wasm module script') ||
      msg.includes('MIME type of "text/html"') ||
      msg.includes('error loading dynamically imported module');

    if (isChunk) {
      const reloadKey = 'eb_chunk_auto_reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, 'true');
        // Clear caches and reload
        if (typeof window !== 'undefined' && 'caches' in window) {
          (window as any).caches.keys().then((names: string[]) => {
            for (const name of names) (window as any).caches.delete(name);
          }).finally(() => {
            (window as any).location.reload();
          });
        } else if (typeof window !== 'undefined') {
          (window as any).location.reload();
        }
      }
    }
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null, isChunkError: false });
  };

  handleReload = () => {
    try {
      sessionStorage.removeItem('eb_chunk_auto_reload');
      sessionStorage.removeItem('vite_preload_retry');
    } catch {}

    if (typeof window !== 'undefined' && 'caches' in window) {
      (window as any).caches.keys().then((names: string[]) => {
        for (const name of names) (window as any).caches.delete(name);
      }).finally(() => {
        (window as any).location.reload();
      });
    } else if (typeof window !== 'undefined') {
      (window as any).location.reload();
    }
  };

  render() {
    if ((this as any).state.hasError) {
      if ((this as any).props.fallback) {
        return (this as any).props.fallback;
      }

      const isChunk = (this as any).state.isChunkError;

      return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl space-y-6">
            <div className="text-center space-y-3">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                isChunk
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {isChunk ? <Sparkles className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-black font-display uppercase tracking-wide text-white">
                  {isChunk ? "Mise à jour disponible" : "Une erreur est survenue"}
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {isChunk
                    ? "Une nouvelle version de NexaStock a été déployée. Cliquez sur le bouton ci-dessous pour charger les derniers modules."
                    : "L'application a rencontré un problème inattendu. Veuillez réessayer."}
                </p>
              </div>
            </div>

            {(this as any).state.error && (
              <div className="bg-gray-950 border border-gray-800 p-4 rounded-2xl">
                <p className="text-[11px] font-mono text-gray-400 break-all leading-relaxed">
                  {(this as any).state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/15"
              >
                <RefreshCw className="w-4 h-4" /> {isChunk ? "Mettre à jour maintenant" : "Recharger la page"}
              </button>
              {!isChunk && (
                <button
                  onClick={this.handleReset}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Home className="w-4 h-4" /> Réessayer
                </button>
              )}
            </div>

            <p className="text-[10px] text-gray-600 font-mono text-center">
              NexaStock Cloud Multi-Tenant • Session protégée
            </p>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
