<template>
    <div id="login">
        <div class="card">
            <h1>DAG</h1>
            <p class="tagline">GitOps deployments</p>

            <div v-if="isExchanging" class="status">
                <i class="fa fa-spinner fa-spin" />
                Signing you in...
            </div>

            <div v-else-if="!isConfigured" class="status error">
                <i class="fa fa-triangle-exclamation" />
                <div>
                    <p>GitLab sign-in is not configured on this server.</p>
                    <p class="hint">Set <code>GITLAB_OAUTH_CLIENT_ID</code> and <code>GITLAB_OAUTH_CLIENT_SECRET</code>.</p>
                </div>
            </div>

            <button v-else class="primary gitlab" :disabled="isRedirecting" @click="signIn">
                <i class="fa-brands fa-gitlab" />
                {{ isRedirecting ? 'Redirecting...' : 'Sign in with GitLab' }}
            </button>

            <p class="note">Access to apps and environments follows your GitLab permissions on the IaC repository they deploy into.</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert } from '@zyno-io/vue-foundation';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { LOCAL_STORAGE_AUTH_KEY } from '@/openapi-client';
import { IacsApi, SessionApi } from '@/openapi-client-generated';
import { useStore } from '@/store';

const route = useRoute();
const router = useRouter();
const store = useStore();

const isConfigured = ref(true);
const isRedirecting = ref(false);
const isExchanging = ref(false);

function redirectUri(): string {
    // Must match exactly what the server allow-lists, and what GitLab has registered.
    return `${window.location.origin}/login`;
}

async function signIn() {
    try {
        isRedirecting.value = true;
        const returnPath = (route.query.returnPath as string) || '/apps';
        const { url } = await dataFromAsync(SessionApi.getSessionGetLoginUrl({ query: { redirectUri: redirectUri(), returnPath } }));
        window.location.href = url;
    } catch (err) {
        isRedirecting.value = false;
        handleErrorAndAlert(err);
    }
}

/** GitLab sends the user back here with ?code=&state=; trade them for a session. */
async function completeLogin(code: string, state: string) {
    try {
        isExchanging.value = true;
        const { jwt, returnPath } = await dataFromAsync(SessionApi.postSessionLogin({ body: { code, state } }));

        localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, jwt);
        store.sessionUser = await dataFromAsync(SessionApi.getSessionGetIdentity());

        const iacs = await dataFromAsync(IacsApi.getIacsIndex());
        store.isOperator = iacs.some(iac => iac.role === 'manage');

        await router.replace(returnPath || '/apps');
    } catch (err) {
        isExchanging.value = false;
        // Strip the spent code/state so a refresh doesn't retry a code GitLab has already burned.
        await router.replace({ name: 'login' });
        handleErrorAndAlert(err);
    }
}

onMounted(async () => {
    const { code, state } = route.query;
    if (typeof code === 'string' && typeof state === 'string') {
        await completeLogin(code, state);
        return;
    }

    try {
        const status = await dataFromAsync(SessionApi.getSessionGetStatus());
        isConfigured.value = status.isConfigured;
    } catch {
        // If we can't reach the server, let the button fail loudly rather than hiding it.
        isConfigured.value = true;
    }
});
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#login {
    @apply flex-1 flex items-center justify-center p-6;
}

.card {
    @apply flex flex-col items-center gap-3 p-8 w-[420px] border border-neutral-500/25 rounded-xl;
}

.tagline {
    @apply text-sm text-neutral-500 -mt-2;
}

.gitlab {
    @apply w-full flex items-center justify-center gap-2 py-2 mt-3;
}

.status {
    @apply flex items-center gap-3 mt-3 text-sm text-neutral-500;

    &.error {
        @apply items-start text-red-600 text-left;
    }

    .hint {
        @apply mt-1 text-neutral-500;
    }
}

.note {
    @apply mt-2 text-xs text-neutral-500 text-center;
}
</style>
