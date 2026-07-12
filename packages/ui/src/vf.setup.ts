import type { App } from 'vue';

import { configureVf, createFilters, installVf } from '@zyno-io/vue-foundation';

configureVf({});

export const filters = createFilters(() => ({}));

declare module 'vue' {
    export interface ComponentCustomProperties {
        $filters: typeof filters;
    }
}

export function setupVf(app: App) {
    installVf(app);
    app.config.globalProperties.$filters = filters;
}
