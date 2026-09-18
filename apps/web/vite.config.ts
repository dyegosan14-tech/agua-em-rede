import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento o navegador fala somente com o Vite (mesma origem); /api e /health são
// encaminhados à API. Assim o cookie de sessão é de mesma origem e não há CORS a configurar.
const apiTarget = process.env['VITE_API_PROXY_TARGET'] ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget },
      '/health': { target: apiTarget },
    },
  },
  build: { sourcemap: true },
});
