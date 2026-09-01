import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import OfficeBrandBridge from './OfficeBrandBridge';
import './styles.css';
import './legacy-auth.css';
import './original-layout.css';
import './interaction-feedback.css';
import './office-brand.css';
import './module-fixes.css';
import './screen-fixes.css';
import './accessibility-vision.css';
import './pages/whatsapp-conversations.css';
import './pages/agent-advanced.css';
import './pages/investigation.css';
import './pages/client-cards.css';
import './pages/card-layouts.css';
import './pages/calculator-cards.css';
import './pages/settings-enhanced.css';
import './pages/dashboard-premium.css';
import './pages/signatures.css';
import './luxury-office-theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <OfficeBrandBridge><App /></OfficeBrandBridge>
    </BrowserRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('LEXOFFICE service worker registration failed:', error);
    });
  });
}
