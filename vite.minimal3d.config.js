import { defineConfig } from 'vite';

export default defineConfig({
  // Keep Minimal3D isolated from the existing Xander setup.
  // This means `npm run dev:minimal3d` serves Minimal3D,
  // while the existing `npm run dev` still serves Xander exactly as before.
  root: './Minimal3D',
  build: {
    outDir: '../dist-minimal3d',
    rollupOptions: {
      input: {
        index: './Minimal3D/index.html',
        admin: './Minimal3D/admin.html',
      },
    },
  },
});