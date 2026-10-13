import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// The native app ships its own copy of the web build, so only the browser
// version needs a service worker for offline use.
if (!Capacitor.isNativePlatform()) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
