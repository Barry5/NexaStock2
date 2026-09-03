import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx';
import { PWALifecycle } from './pwa/PWALifecycle';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Intercept browser extension message channel closures to prevent unhandled rejection crashes
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (
    msg.includes('A listener indicated an asynchronous response by returning true') ||
    msg.includes('message channel closed before a response was received')
  ) {
    event.preventDefault();
  }
});

// Vite preload error handler: automatically reloads the page if a chunk hash mismatch occurs after a new deployment
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Preload error detected (deployment chunk update), reloading page...', event);
  const reloadKey = 'vite_preload_retry';
  if (!sessionStorage.getItem(reloadKey)) {
    sessionStorage.setItem(reloadKey, 'true');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <PWALifecycle />
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
