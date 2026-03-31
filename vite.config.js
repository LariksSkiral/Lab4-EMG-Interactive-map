import { defineConfig } from 'vite';

export default defineConfig({
  root: './Xander',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: './Xander/index.html',
    },
  },
});