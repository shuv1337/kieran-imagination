import path from 'path';
import { promises as fsp } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const generatedDir = path.resolve(__dirname, 'public', 'generated');

const saveImageMiddleware = () => {
  const handler = async (req: any, res: any, next: any) => {
    if (req.method !== 'POST' || req.url !== '/api/images') {
      return next();
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { dataUrl, fileName } = JSON.parse(body || '{}');
        if (!dataUrl || !fileName || typeof dataUrl !== 'string' || typeof fileName !== 'string') {
          res.statusCode = 400;
          res.end('Invalid payload');
          return;
        }

        const match = dataUrl.match(/^data:(image\/[-+.\w]+);base64,(.+)$/);
        if (!match) {
          res.statusCode = 400;
          res.end('Invalid data URL');
          return;
        }

        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'kierans-art.png';
        await fsp.mkdir(generatedDir, { recursive: true });
        const buffer = Buffer.from(match[2], 'base64');
        await fsp.writeFile(path.join(generatedDir, safeName), buffer);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url: `/generated/${safeName}` }));
      } catch (err) {
        console.error('Failed to save image', err);
        res.statusCode = 500;
        res.end('Failed to save image');
      }
    });
  };

  return {
    name: 'save-generated-images',
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['kier.shuv.app'],
    },
    plugins: [
      react(),
      saveImageMiddleware(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'pwa-icon.png'],
        manifest: {
          name: "Kieran's Imagination",
          short_name: "Kieran's App",
          description: 'AI Image Generator for Kids',
          theme_color: '#011627',
          background_color: '#011627',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-icon.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-icon.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts'
    }
  };
});
