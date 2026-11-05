import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from '@noir/ui';
import { App } from './App.tsx';
import './styles.css';

void loadFonts();
if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/phone/sw.js', { scope: '/phone/' });
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
