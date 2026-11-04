import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import { RecordingToolbar } from './RecordingToolbar';

document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecordingToolbar />
  </StrictMode>,
);
