import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from '@noir/ui';
import { App } from './App.tsx';
import './styles.css';
import { isStandalone } from './lib/android.ts';
import { startStandalone } from './standalone.ts';

// Inside the NOIR Android TV launcher, run self-contained (no NOIR server).
if (isStandalone()) startStandalone();

void loadFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
