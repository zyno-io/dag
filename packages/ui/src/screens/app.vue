<template>
    <div id="app-detail">
        <LoaderModal v-if="isLoading" />

        <template v-else-if="app">
            <div class="header">
                <div>
                    <h1>{{ app.name }}</h1>
                    <a :href="app.repoUrl" target="_blank" rel="noopener" class="repo">{{ app.repoUrl }}</a>
                </div>
                <div class="header-actions">
                    <button v-if="app.canManage" @click="openEditApp">Edit</button>
                    <button v-if="app.canManage" class="danger" @click="destroyApp">Delete</button>
                </div>
            </div>

            <section>
                <div class="section-header">
                    <h2>Environments</h2>
                    <button v-if="canAddEnvironment" @click="openCreateEnvironment">Add environment</button>
                </div>

                <div class="environments">
                    <div v-for="env in app.environments" :key="env.id" class="environment">
                        <div class="env-header">
                            <div>
                                <span class="env-name">{{ env.name }}</span>
                                <span class="env-branch">{{ env.branch }}</span>
                            </div>
                            <div v-if="env.canManage" class="env-actions">
                                <button @click="openEditEnvironment(env)">Edit</button>
                                <button class="danger" :disabled="app.environments.length <= 1" @click="destroyEnvironment(env)">Delete</button>
                            </div>
                        </div>

                        <dl class="env-fields">
                            <div>
                                <dt>IaC repo</dt>
                                <dd>{{ env.iacName }}</dd>
                            </div>
                            <div>
                                <dt>Chart path</dt>
                                <dd class="mono">{{ env.iacPath }}</dd>
                            </div>
                            <div>
                                <dt>IaC branch</dt>
                                <dd>{{ env.iacBranch ?? 'default' }}</dd>
                            </div>
                            <div>
                                <dt>Cluster</dt>
                                <dd>{{ env.clusterName }}</dd>
                            </div>
                            <div>
                                <dt>Helm</dt>
                                <dd>{{ env.helmType }}</dd>
                            </div>
                            <div>
                                <dt>Release</dt>
                                <dd>{{ env.helmName ?? '—' }} / {{ env.helmNamespace ?? '—' }}</dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </section>

            <section>
                <h2>Recent deployments</h2>
                <DeploymentTable :deployments="deployments" empty-text="No deployments yet." />
            </section>
        </template>

        <VfModal v-if="showAppForm" @close="showAppForm = false">
            <div class="form-modal">
                <h2>Edit app</h2>
                <form @submit.prevent="submitApp">
                    <label>
                        App name
                        <input v-model="appForm.name" type="text" required />
                    </label>
                    <label>
                        Repository URL
                        <input v-model="appForm.repoUrl" type="url" required />
                    </label>
                    <div class="actions">
                        <button type="button" @click="showAppForm = false">Cancel</button>
                        <button type="submit" class="primary" :disabled="isSubmitting">{{ isSubmitting ? 'Saving...' : 'Save' }}</button>
                    </div>
                </form>
            </div>
        </VfModal>

        <VfModal v-if="showEnvironmentForm" @close="showEnvironmentForm = false">
            <div class="form-modal">
                <h2>{{ editingEnvironmentId ? 'Edit environment' : 'Add environment' }}</h2>
                <form @submit.prevent="submitEnvironment">
                    <EnvironmentFields v-model="environmentForm" :iacs="manageableIacs" :clusters="clusters" />
                    <div class="actions">
                        <button type="button" @click="showEnvironmentForm = false">Cancel</button>
                        <button type="submit" class="primary" :disabled="isSubmitting">{{ isSubmitting ? 'Saving...' : 'Save' }}</button>
                    </div>
                </form>
            </div>
        </VfModal>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert, showConfirmDestroy, VfModal } from '@zyno-io/vue-foundation';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
    AppsApi,
    ClustersApi,
    DeploymentsApi,
    EnvironmentsApi,
    IacsApi,
    type IAppDetailResponse,
    type IClusterResponse,
    type IDeploymentResponse,
    type IEnvironmentResponse,
    type IIacResponse
} from '@/openapi-client-generated';
import DeploymentTable from '@/shared/components/deployment-table.vue';
import EnvironmentFields from '@/shared/components/environment-fields.vue';
import LoaderModal from '@/shared/components/loader-modal.vue';
import { blankEnvironment, toEnvironmentForm, type EnvironmentForm } from '@/shared/environment-form';

const route = useRoute();
const router = useRouter();

const appId = Number(route.params.appId);

const app = ref<IAppDetailResponse>();
const deployments = ref<IDeploymentResponse[]>([]);
const iacs = ref<IIacResponse[]>([]);
const clusters = ref<IClusterResponse[]>([]);

const isLoading = ref(true);
const isSubmitting = ref(false);

const showAppForm = ref(false);
const appForm = ref({ name: '', repoUrl: '' });

const showEnvironmentForm = ref(false);
const editingEnvironmentId = ref<number | null>(null);
const environmentForm = ref<EnvironmentForm>(blankEnvironment());

const manageableIacs = computed(() => iacs.value.filter(iac => iac.role === 'manage'));
// Adding an environment needs manage on the app itself (the server enforces requireManage), not
// merely manage on some unrelated repo — otherwise the button would always 403.
const canAddEnvironment = computed(() => !!app.value?.canManage && manageableIacs.value.length > 0);

async function load() {
    try {
        app.value = await dataFromAsync(AppsApi.getAppsShow({ path: { id: appId } }));
        deployments.value = await dataFromAsync(DeploymentsApi.getDeploymentsIndex({ query: { appId } }));
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
}

/** Only needed to populate the environment form's pickers. */
async function loadFormOptions() {
    try {
        iacs.value = await dataFromAsync(IacsApi.getIacsIndex());
        clusters.value = await dataFromAsync(ClustersApi.getClustersIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    }
}

function openEditApp() {
    if (!app.value) return;
    appForm.value = { name: app.value.name, repoUrl: app.value.repoUrl };
    showAppForm.value = true;
}

async function submitApp() {
    try {
        isSubmitting.value = true;
        await dataFromAsync(
            AppsApi.putAppsUpdate({
                path: { id: appId },
                // Preserve the stored provider — the form doesn't edit it, and hardcoding 'gitlab'
                // would silently convert an existing GitHub app.
                body: { name: appForm.value.name, gitProvider: app.value?.gitProvider ?? 'gitlab', repoUrl: appForm.value.repoUrl }
            })
        );
        showAppForm.value = false;
        await load();
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isSubmitting.value = false;
    }
}

async function destroyApp() {
    if (!app.value) return;
    const confirmed = await showConfirmDestroy('Delete app', `Delete "${app.value.name}" and all of its environments and deployment history?`);
    if (!confirmed) return;

    try {
        await dataFromAsync(AppsApi.deleteAppsDestroy({ path: { id: appId } }));
        await router.push({ name: 'apps' });
    } catch (err) {
        handleErrorAndAlert(err);
    }
}

async function openCreateEnvironment() {
    editingEnvironmentId.value = null;
    environmentForm.value = blankEnvironment();
    showEnvironmentForm.value = true;
    await loadFormOptions();
}

async function openEditEnvironment(environment: IEnvironmentResponse) {
    editingEnvironmentId.value = environment.id;
    environmentForm.value = toEnvironmentForm(environment);
    showEnvironmentForm.value = true;
    await loadFormOptions();
}

async function submitEnvironment() {
    try {
        isSubmitting.value = true;

        if (editingEnvironmentId.value) {
            await dataFromAsync(
                EnvironmentsApi.putEnvironmentsUpdate({
                    path: { appId, id: editingEnvironmentId.value },
                    body: environmentForm.value
                })
            );
        } else {
            await dataFromAsync(EnvironmentsApi.postEnvironmentsCreate({ path: { appId }, body: environmentForm.value }));
        }

        showEnvironmentForm.value = false;
        await load();
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isSubmitting.value = false;
    }
}

async function destroyEnvironment(environment: IEnvironmentResponse) {
    const confirmed = await showConfirmDestroy('Delete environment', `Delete "${environment.name}" and its deployment history?`);
    if (!confirmed) return;

    try {
        await dataFromAsync(EnvironmentsApi.deleteEnvironmentsDestroy({ path: { appId, id: environment.id } }));
        await load();
    } catch (err) {
        handleErrorAndAlert(err);
    }
}

onMounted(load);
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#app-detail {
    @apply flex flex-col gap-8;
}

.header {
    @apply flex items-start justify-between;

    .repo {
        @apply text-xs text-neutral-500;
    }

    .header-actions {
        @apply flex gap-2;
    }
}

section {
    @apply flex flex-col gap-3;
}

.section-header {
    @apply flex items-center justify-between;
}

.environments {
    @apply flex flex-col gap-3;
}

.environment {
    @apply border border-neutral-500/25 rounded-lg p-4 flex flex-col gap-3;

    .env-header {
        @apply flex items-center justify-between;
    }

    .env-name {
        @apply font-semibold;
    }

    .env-branch {
        @apply ml-2 text-xs text-neutral-500;
    }

    .env-actions {
        @apply flex gap-2;
    }

    .env-fields {
        @apply grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3;

        dt {
            @apply text-xs uppercase tracking-wide text-neutral-500;
        }
    }
}

.form-modal {
    @apply flex flex-col gap-3 w-[520px];

    form {
        @apply flex flex-col gap-3 mt-2;
    }

    .actions {
        @apply flex justify-end gap-2 mt-2;
    }
}
</style>
