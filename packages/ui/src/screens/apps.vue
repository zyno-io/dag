<template>
    <div id="apps">
        <div class="header">
            <h1>Apps</h1>
            <button v-if="canCreate" class="primary" @click="openCreate">Add app</button>
        </div>

        <LoaderModal v-if="isLoading" />

        <template v-else>
            <div v-if="apps.length" class="search-bar">
                <i class="fa fa-magnifying-glass" />
                <input v-model="search" type="search" aria-label="Search apps" placeholder="Search apps..." />
            </div>

            <div class="app-list">
                <div v-if="!apps.length" class="empty">
                    <i class="fa fa-cubes" />
                    <h2>No apps yet</h2>
                    <p v-if="canCreate">Add an app to start deploying it from CI.</p>
                    <p v-else>You'll see apps whose source or IaC repositories you can access in GitLab.</p>
                </div>
                <div v-else-if="!visibleApps.length" class="empty">
                    <i class="fa fa-magnifying-glass" />
                    <h2>No matching apps</h2>
                </div>

                <div v-for="app in visibleApps" :key="app.id" class="app" @click="$router.push({ name: 'app', params: { appId: app.id } })">
                    <div class="app-main">
                        <div class="app-name">{{ app.name }}</div>
                        <div class="app-repo">{{ app.repoUrl }}</div>
                    </div>
                    <div class="app-meta">
                        <span class="env-count">{{ app.environmentCount }} {{ app.environmentCount === 1 ? 'environment' : 'environments' }}</span>
                        <span v-if="!app.canManage" class="read-only" title="Deployment configuration requires IaC maintainer access">read-only</span>
                    </div>
                </div>
            </div>
        </template>

        <VfModal v-if="showCreate" @close="showCreate = false">
            <div class="create-form">
                <h2>Add app</h2>

                <form @submit.prevent="submitCreate">
                    <label>
                        App name
                        <input v-model="form.name" type="text" required placeholder="my-service" />
                    </label>

                    <label>
                        Repository URL
                        <input v-model="form.repoUrl" type="url" required placeholder="https://gitlab.example.com/org/my-service" />
                    </label>

                    <p class="section-note">An app needs an environment before it can deploy. Its IaC repository controls who may configure it.</p>

                    <EnvironmentFields v-model="form.environment" :iacs="manageableIacs" :clusters="clusters" />

                    <div class="actions">
                        <button type="button" @click="showCreate = false">Cancel</button>
                        <button type="submit" class="primary" :disabled="isSubmitting">
                            {{ isSubmitting ? 'Creating...' : 'Create app' }}
                        </button>
                    </div>
                </form>
            </div>
        </VfModal>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert, VfModal } from '@zyno-io/vue-foundation';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AppsApi, ClustersApi, IacsApi, type IAppResponse, type IClusterResponse, type IIacResponse } from '@/openapi-client-generated';
import EnvironmentFields from '@/shared/components/environment-fields.vue';
import LoaderModal from '@/shared/components/loader-modal.vue';
import { blankEnvironment, type EnvironmentForm } from '@/shared/environment-form';

const router = useRouter();

const apps = ref<IAppResponse[]>([]);
const iacs = ref<IIacResponse[]>([]);
const clusters = ref<IClusterResponse[]>([]);
const isLoading = ref(true);
const showCreate = ref(false);
const isSubmitting = ref(false);
const search = ref('');

const visibleApps = computed(() => {
    const sorted = [...apps.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const query = search.value.trim().toLocaleLowerCase();
    if (!query) return sorted;
    return sorted.filter(app => app.name.toLocaleLowerCase().includes(query) || app.repoUrl.toLocaleLowerCase().includes(query));
});

const form = reactive<{ name: string; repoUrl: string; environment: EnvironmentForm }>({
    name: '',
    repoUrl: '',
    environment: blankEnvironment()
});

// You can only put an app somewhere you could already deploy by hand.
const manageableIacs = computed(() => iacs.value.filter(iac => iac.role === 'manage'));
const canCreate = computed(() => manageableIacs.value.length > 0);

async function load() {
    try {
        apps.value = await dataFromAsync(AppsApi.getAppsIndex());
        iacs.value = await dataFromAsync(IacsApi.getIacsIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
}

async function openCreate() {
    form.name = '';
    form.repoUrl = '';
    form.environment = blankEnvironment();
    showCreate.value = true;

    try {
        // Only an operator reaches this, and only an operator may list clusters.
        clusters.value = await dataFromAsync(ClustersApi.getClustersIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    }
}

async function submitCreate() {
    try {
        isSubmitting.value = true;
        const app = await dataFromAsync(
            AppsApi.postAppsCreate({
                body: {
                    name: form.name,
                    gitProvider: 'gitlab',
                    repoUrl: form.repoUrl,
                    environment: form.environment
                }
            })
        );
        showCreate.value = false;
        await router.push({ name: 'app', params: { appId: app.id } });
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isSubmitting.value = false;
    }
}

onMounted(load);
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#apps {
    @apply flex flex-col gap-4;
}

.header {
    @apply flex items-center justify-between;
}

.search-bar {
    @apply flex items-center gap-3 px-4 py-2.5 bg-neutral-500/10 border border-neutral-500/25 rounded-md text-neutral-400 focus-within:border-neutral-500/50 transition-colors;

    i {
        @apply text-sm;
    }

    input {
        @apply flex-1 bg-transparent border-0 p-0 outline-none text-base text-neutral-900 placeholder:text-neutral-500;
    }
}

html.dark .search-bar input {
    @apply text-neutral-100;
}

.app-list {
    @apply flex flex-col gap-2;
}

.empty {
    @apply flex flex-col items-center gap-2 py-12 text-neutral-500 text-center;

    i {
        @apply text-3xl;
    }
}

.app {
    @apply flex justify-between items-center p-4 border border-neutral-500/25 rounded-lg cursor-pointer hover:bg-neutral-100;

    .app-name {
        @apply font-semibold;
    }

    .app-repo {
        @apply text-xs text-neutral-500;
    }

    .app-meta {
        @apply flex items-center gap-3 text-xs text-neutral-500;
    }

    .read-only {
        @apply uppercase tracking-wide px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-700;
    }
}

html.dark .app:hover {
    @apply bg-neutral-800;
}

html.dark .app .read-only {
    @apply bg-neutral-700 text-neutral-200;
}

.create-form {
    @apply flex flex-col gap-3 w-[520px];

    form {
        @apply flex flex-col gap-3 mt-2;
    }

    .section-note {
        @apply text-xs text-neutral-500 border-t border-neutral-500/20 pt-3;
    }

    .actions {
        @apply flex justify-end gap-2 mt-2;
    }
}
</style>
