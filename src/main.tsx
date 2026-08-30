import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import OfficeBrandBridge from './OfficeBrandBridge';
import AutoRefreshBridge from './AutoRefreshBridge';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AutoRefreshBridge><OfficeBrandBridge><App /></OfficeBrandBridge></AutoRefreshBridge>
    </BrowserRouter>
  </React.StrictMode>
);
