import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const designSystemCss = () => ['tokens','foundations','components'].map(name => readFileSync(new URL(`./src/design-system/${name}.css`, import.meta.url),'utf8')).join('\n');
export default defineConfig({
  plugins: [react(), {
    name: 'lexoffice-shared-design-system',
    configureServer(server) {
      server.middlewares.use('/lexoffice-design-system.css', (_request, response) => {
        response.setHeader('Content-Type','text/css');response.end(designSystemCss());
      });
    },
    generateBundle() { this.emitFile({type:'asset',fileName:'lexoffice-design-system.css',source:designSystemCss()}); },
  }],
});
