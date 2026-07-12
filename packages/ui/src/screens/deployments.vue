<template>
    <div id="deployments">
        <h1>Deployments</h1>

        <div class="filters">
            <label>
                App
                <select v-model.number="filters.appId" @change="onAppChange">
                    <option :value="0">All apps</option>
                    <option v-for="app in apps" :key="app.id" :value="app.id">{{ app.name }}</option>
                </select>
            </label>

            <label>
                Environment
                <select v-model.number="filters.environmentId" :disabled="!filters.appId" @change="load">
                    <option :value="0">All environments</option>
                    <option v-for="env in environments" :key="env.id" :value="env.id">{{ env.name }}</option>
                </select>
            </label>

            <label>
                Status
                <select v-model="filters.status" @change="load">
                    <option value="">Any status</option>
                    <option v-for="status in ALL_STATUSES" :key="status" :value="status">{{ status }}</option>
                </select>
            </label>
        </div>

        <LoaderModal v-if="isLoading" />
        <DeploymentTable v-else :deployments="deployments" show-app empty-text="No deployments match these filters." />
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert } from '@zyno-io/vue-foundation';
import { onMounted, reactive, ref } from 'vue';

import type { DeploymentStatus } from '@/shared/deployment-status';

import { AppsApi, DeploymentsApi, type IAppResponse, type IDeploymentResponse, type IEnvironmentResponse } from '@/openapi-client-generated';
import DeploymentTable from '@/shared/components/deployment-table.vue';
import LoaderModal from '@/shared/components/loader-modal.vue';

const ALL_STATUSES: DeploymentStatus[] = ['pending', 'validating', 'pushing', 'pushed', 'monitoring', 'deployed', 'failed'];

const apps = ref<IAppResponse[]>([]);
const environments = ref<IEnvironmentResponse[]>([]);
const deployments = ref<IDeploymentResponse[]>([]);
const isLoading = ref(true);

// 0 / '' mean "unset" — they're omitted from the query rather than sent as filters.
const filters = reactive({ appId: 0, environmentId: 0, status: '' as DeploymentStatus | '' });

async function load() {
    try {
        isLoading.value = true;
        deployments.value = await dataFromAsync(
            DeploymentsApi.getDeploymentsIndex({
                query: {
                    ...(filters.appId ? { appId: filters.appId } : {}),
                    ...(filters.environmentId ? { environmentId: filters.environmentId } : {}),
                    ...(filters.status ? { status: filters.status } : {})
                }
            })
        );
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
}

async function onAppChange() {
    filters.environmentId = 0;
    environments.value = [];

    if (filters.appId) {
        try {
            environments.value = await dataFromAsync(AppsApi.getAppsShow({ path: { id: filters.appId } })).then(app => app.environments);
        } catch (err) {
            handleErrorAndAlert(err);
        }
    }

    await load();
}

onMounted(async () => {
    try {
        apps.value = await dataFromAsync(AppsApi.getAppsIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    }
    await load();
});
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#deployments {
    @apply flex flex-col gap-4;
}

.filters {
    @apply flex gap-3;

    > label {
        @apply w-52;
    }
}
</style>
