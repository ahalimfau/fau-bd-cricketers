import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

// Clickjacking guard: GitHub Pages can't send the frame-ancestors header, so
// refuse to run inside another site's frame.
if (window.top !== window.self) {
  document.body.textContent = 'FAU BD Cricketers cannot be shown inside another website.';
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
