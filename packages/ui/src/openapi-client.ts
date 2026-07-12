import { OpenApiError } from '@zyno-io/openapi-client-codegen';
import { configureVfOpenApiClient, UserError } from '@zyno-io/vue-foundation';

import { client } from './openapi-client-generated/client.gen';
import { useStore } from './store';

export const LOCAL_STORAGE_AUTH_KEY = 'dag:jwt';

// No baseUrl: the API is same-origin in production (the server serves this bundle) and in
// development (Vite proxies /api), so relative URLs work in both.
client.setConfig({
    credentials: 'include'
});

configureVfOpenApiClient(client, {
    headers() {
        const jwt = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY);
        return jwt ? { Authorization: `Bearer ${jwt}` } : {};
    },

    onError(err) {
        if (err instanceof OpenApiError) {
            // An expired or revoked session should drop us back to the login screen rather
            // than surfacing as an error on whatever screen happened to be open.
            if (err.response?.status === 401) {
                localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
                useStore().sessionUser = null;
                return err;
            }
        }
        if (!(err instanceof UserError)) {
            console.error(err);
        }
    }
});
