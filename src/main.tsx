import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA standalone operation and offline caching
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Nueva versión de Gastro Smart disponible');
  },
  onOfflineReady() {
    console.log('Gastro Smart lista para operar sin conexión');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

