<template>
    <div id="app">
        <div v-if="store.globalError" id="global-error" v-text="store.globalError" />

        <div v-else-if="!isReady" id="initial-loader">
            <i class="fa fa-spinner fa-spin" />
        </div>

        <Login v-else-if="!store.sessionUser || $route.path === '/login'" />

        <Layout v-else>
            <router-view />
        </Layout>

        <OverlayContainer />
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync, OpenApiError } from '@zyno-io/openapi-client-codegen';
import { OverlayContainer } from '@zyno-io/vue-foundation';
import { onMounted, ref } from 'vue';

import { LOCAL_STORAGE_AUTH_KEY } from './openapi-client';
import { IacsApi, SessionApi } from './openapi-client-generated';
import Login from './screens/login.vue';
import Layout from './shared/components/layout.vue';
import { useStore } from './store';

const store = useStore();
const isReady = ref(false);

onMounted(async () => {
    if (localStorage.getItem(LOCAL_STORAGE_AUTH_KEY)) {
        try {
            store.sessionUser = await dataFromAsync(SessionApi.getSessionGetIdentity());

            // "Operator" isn't a stored flag — it means holding manage on some IaC repo, which
            // only GitLab can answer. The IaC list already carries the caller's resolved role.
            const iacs = await dataFromAsync(IacsApi.getIacsIndex());
            store.isOperator = iacs.some(iac => iac.role === 'manage');
        } catch (err) {
            // A 401 here just means the stored token is stale; the client already cleared it.
            if (!(err instanceof OpenApiError && err.response?.status === 401)) {
                console.error(err);
            }
        }
    }

    isReady.value = true;
});
</script>

<style>
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));
</style>

<style lang="scss">
@use './shared/styles/base.scss' as *;
@reference "tailwindcss";

#app {
    @apply flex-1 flex;
}

#global-error {
    @apply flex-1 flex justify-center items-center bg-gray-800 text-2xl text-red-300;
}

#initial-loader {
    @apply flex-1 flex justify-center items-center text-3xl text-neutral-400;
}
</style>
