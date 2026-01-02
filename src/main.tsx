import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// Register the service worker (PWA).
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
