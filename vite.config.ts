import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './server/api.js';

/** Mounts the editor's file API into Vite's dev server so `npm run dev` is a single process. */
function editorApi(): Plugin {
  return {
    name: 'editor-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        apiMiddleware(req, res).then((handled) => {
          if (!handled) next();
        }, next);
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: { outDir: 'dist/editor', emptyOutDir: true },
  plugins: [react(), editorApi()],
  server: { port: 4321, strictPort: false },
});
