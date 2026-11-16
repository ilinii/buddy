import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const mobileHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: mobileHost || '127.0.0.1', port: 1420, strictPort: true, hmr: mobileHost ? { protocol: 'ws', host: mobileHost, port: 1422 } : undefined, watch: { ignored: ['**/.taste-skill/**', '**/.toolchain/**', '**/shots/**', '**/test-results/**', '**/playwright-report/**', '**/src-tauri/target/**'] } },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1100 },
});
