import vue from '@vitejs/plugin-vue';
import { openapiClientGeneratorPlugin } from '@zyno-io/vue-foundation/vite-plugins';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import oxlintPlugin from 'vite-plugin-oxlint';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
process.env.VITE_APP_VERSION = version;

const API_TARGET = process.env.VITE_DEV_API_URL ?? 'http://localhost:3000';

export default defineConfig({
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler'
            }
        }
    },
    server: {
        port: 3001,
        // Proxy the API in dev so the app is same-origin in development just as it is in
        // production (where the server serves this bundle from ./static). Without this the
        // deployment stream would need cross-origin EventSource, and the OAuth redirect
        // origin would differ between environments.
        proxy: {
            '/api': {
                target: API_TARGET,
                changeOrigin: true,
                // Deployment status arrives over SSE; buffering it would defeat the point.
                configure: proxy => {
                    proxy.on('proxyRes', (proxyRes, req, res) => {
                        if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                            res.flushHeaders?.();
                        }
                    });
                }
            }
        }
    },
    build: {
        sourcemap: true,
        target: 'esnext',
        // The server ships this bundle: ts-server-foundation's staticFiles serves ./static
        // with an index.html fallback for client-side routes.
        outDir: '../server/static',
        emptyOutDir: true
    },
    plugins: [vue(), oxlintPlugin(), openapiClientGeneratorPlugin()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
});
