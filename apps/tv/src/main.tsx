import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadFonts } from '@noir/ui';
import { App } from './App.tsx';
import './styles.css';

void loadFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
