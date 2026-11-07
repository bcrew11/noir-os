import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from '@noir/ui';
import { App } from './App.tsx';
import { DreamApp } from './DreamApp.tsx';
import './styles.css';
import { isStandalone } from './lib/android.ts';
import { startStandalone } from './standalone.ts';

// Inside the NOIR Android TV launcher, run self-contained (no NOIR server).
if (isStandalone()) startStandalone();
// Opened by the Android screensaver (NoirDream): show only the ambient display.
const isDream = new URLSearchParams(location.search).get('dream') === '1';

void loadFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDream ? <DreamApp /> : <App />}
  </StrictMode>,
);
