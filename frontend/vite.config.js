import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Sin polyfill de modulepreload: evita el <script> inline que inyecta Vite
    // y permite una CSP estricta (script-src 'self') en nginx/nginx.conf.
    // Navegadores modernos soportan modulepreload de forma nativa.
    modulePreload: { polyfill: false },
  },
})
