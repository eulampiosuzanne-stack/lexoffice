import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './legacy-auth.css';
import './original-layout.css';
import './sf-brand-theme.css';
import './converge-original-adaptation.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
