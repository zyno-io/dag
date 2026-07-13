<template>
    <div id="deployments">
        <h1>Deployments</h1>

        <div class="filters">
            <label>
                App
                <VfSmartSelect
                    v-model="filters.appId"
                    :options="apps"
                    :key-field="'id'"
                    :value-field="'id'"
                    :label-field="'name'"
                    :search-fields="['name', 'repoUrl']"
                    null-title="All apps"
                    @update:model-value="onAppChange"
                />
            </label>

            <label>
                Environment
                <VfSmartSelect
                    v-model="filters.environmentId"
                    :options="environments"
                    :key-field="'id'"
                    :value-field="'id'"
                    :label-field="'name'"
                    null-title="All environments"
                    :disabled="!filters.appId"
                    @update:model-value="load"
                />
            </label>

            <label>
                Status
                <VfSmartSelect
                    v-model="filters.status"
                    :options="STATUS_OPTIONS"
                    :key-field="'value'"
                    :value-field="'value'"
                    :label-field="'label'"
                    null-title="Any status"
                    @update:model-value="load"
                />
            </label>
        </div>

        <LoaderModal v-if="isLoading" />
        <DeploymentTable v-else :deployments="deployments" show-app empty-text="No deployments match these filters." />
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert, VfSmartSelect } from '@zyno-io/vue-foundation';
import { onMounted, reactive, ref } from 'vue';

import type { DeploymentStatus } from '@/shared/deployment-status';

import { AppsApi, DeploymentsApi, type IAppResponse, type IDeploymentResponse, type IEnvironmentResponse } from '@/openapi-client-generated';
import DeploymentTable from '@/shared/components/deployment-table.vue';
import LoaderModal from '@/shared/components/loader-modal.vue';

const ALL_STATUSES: DeploymentStatus[] = ['pending', 'validating', 'pushing', 'pushed', 'monitoring', 'deployed', 'failed'];
const STATUS_OPTIONS = ALL_STATUSES.map(status => ({ value: status, label: status }));

const apps = ref<IAppResponse[]>([]);
const environments = ref<IEnvironmentResponse[]>([]);
const deployments = ref<IDeploymentResponse[]>([]);
const isLoading = ref(true);

// null means "unset" — these values are omitted from the query rather than sent as filters.
const filters = reactive<{ appId: number | null; environmentId: number | null; status: DeploymentStatus | null }>({
    appId: null,
    environmentId: null,
    status: null
});

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
    filters.environmentId = null;
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
