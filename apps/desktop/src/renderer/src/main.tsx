import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { runExport } from './export/export-renderer';
import './styles/global.css';

const exportMatch = /^#\/export\/(.+)$/.exec(window.location.hash);
if (exportMatch) {
  // Hidden export window: no UI, just render frames.
  void runExport(decodeURIComponent(exportMatch[1]!));
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
