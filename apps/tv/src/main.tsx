import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from '@noir/ui';
import { App } from './App.tsx';
import { DreamApp } from './DreamApp.tsx';
import { BootIntro } from './components/BootIntro.tsx';
import { IntroCover } from './components/IntroCover.tsx';
import './styles.css';
import { isStandalone } from './lib/android.ts';
import { startStandalone } from './standalone.ts';

// Inside the NOIR Android TV launcher, run self-contained (no NOIR server).
if (isStandalone()) startStandalone();
// Opened by the Android screensaver (NoirDream): show only the ambient display.
const params = new URLSearchParams(location.search);
const isDream = params.get('dream') === '1';
// Rendering the intro video (scripts/render-boot-video.mjs): only the intro, frames stepped by the script.
const isBootCapture = params.get('bootcapture') === '1';

void loadFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isBootCapture ? <BootIntro level="full" onDone={() => {}} capture /> : isDream ? <DreamApp /> : <><App /><IntroCover /></>}
  </StrictMode>,
);
