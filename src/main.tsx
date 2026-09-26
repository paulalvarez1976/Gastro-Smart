import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import './index.css';

// Replace synchronous blocking window.alert with a non-blocking in-app toast to prevent Browser Locker detection in iframes
if (typeof window !== 'undefined') {
  window.alert = (message?: any) => {
    const text = String(message ?? '');
    console.info('[Aviso Gastro Smart]:', text);
    try {
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 z-[9999] max-w-sm bg-neutral-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-orange-500/40 text-xs font-bold flex items-center gap-2 transition-all duration-300';
      toast.textContent = text;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    } catch {
      // Fallback silencioso
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

