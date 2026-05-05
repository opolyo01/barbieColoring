import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModuleRegistry } from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import './index.css';
import App from './App';

LicenseManager.setLicenseKey('');
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
