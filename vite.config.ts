import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.'),
      },
    },
    server: {
      // Disabled completely so uploaded videos in public/uploads and JSON data writes never reload client state.
      hmr: false,
      watch: null,
    },
  };
});
