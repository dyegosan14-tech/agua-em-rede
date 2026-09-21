import { configureZodLocale } from '@aer/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ApiError } from './lib/api';
import './index.css';
import 'leaflet/dist/leaflet.css';

configureZodLocale();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erros de negócio (4xx) não se resolvem repetindo; só falhas de rede/5xx merecem nova tentativa.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
