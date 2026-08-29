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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <OfficeBrandBridge><App /></OfficeBrandBridge>
    </BrowserRouter>
  </React.StrictMode>
);
