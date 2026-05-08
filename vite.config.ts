import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@physics': fileURLToPath(new URL('./src/physics', import.meta.url)),
      '@rendering': fileURLToPath(new URL('./src/rendering', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
      '@workers': fileURLToPath(new URL('./src/workers', import.meta.url)),
    },
  },
  assetsInclude: ['**/*.wgsl', '**/*.glsl', '**/*.vert', '**/*.frag'],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
