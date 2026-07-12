<template>
    <div id="clusters">
        <div class="header">
            <div>
                <h1>Clusters</h1>
                <p class="subtitle">Kubernetes clusters environments deploy into.</p>
            </div>
            <button class="primary" @click="openCreate">Add cluster</button>
        </div>

        <LoaderModal v-if="isLoading" />

        <div v-else-if="!clusters.length" class="empty">
            <i class="fa fa-server" />
            <h2>No clusters yet</h2>
            <p>Add a cluster before configuring an environment to deploy into it.</p>
        </div>

        <table v-else>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>API URL</th>
                    <th>CA cert</th>
                    <th>In use by</th>
                    <th />
                </tr>
            </thead>
            <tbody>
                <tr v-for="cluster in clusters" :key="cluster.id">
                    <td class="name">{{ cluster.name }}</td>
                    <td class="mono">{{ cluster.apiUrl }}</td>
                    <td>{{ cluster.hasCaCert ? 'Yes' : 'No' }}</td>
                    <td>{{ cluster.environmentCount }} environment(s)</td>
                    <td class="row-actions">
                        <button @click="openEdit(cluster)">Edit</button>
                        <button class="danger" :disabled="cluster.environmentCount > 0" @click="destroy(cluster)">Delete</button>
                    </td>
                </tr>
            </tbody>
        </table>

        <VfModal v-if="showForm" @close="showForm = false">
            <div class="form-modal">
                <h2>{{ editingId ? 'Edit cluster' : 'Add cluster' }}</h2>

                <form @submit.prevent="submit">
                    <label>
                        Name
                        <input v-model="form.name" type="text" required placeholder="prod-eu" />
                    </label>

                    <label>
                        API URL
                        <input v-model="form.apiUrl" type="url" required placeholder="https://k8s.example.com:6443" />
                    </label>

                    <label>
                        Service account token
                        <input
                            v-model="form.serviceAccountToken"
                            type="password"
                            :required="!editingId"
                            :placeholder="tokenPlaceholder"
                            autocomplete="off"
                        />
                        <span v-if="editingId" class="hint">Leave blank to keep the current token.</span>
                    </label>

                    <label>
                        CA certificate
                        <textarea v-model="form.caCert" rows="4" :placeholder="caCertPlaceholder" />
                        <span v-if="editingId && editingHasCaCert" class="hint">A certificate is stored. Leave blank to keep it.</span>
                        <span v-else class="hint">Optional. Required if the cluster uses a private CA.</span>
                    </label>

                    <div class="actions">
                        <button type="button" @click="showForm = false">Cancel</button>
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
import { computed, onMounted, reactive, ref } from 'vue';

import { ClustersApi, type IClusterResponse } from '@/openapi-client-generated';
import LoaderModal from '@/shared/components/loader-modal.vue';

const clusters = ref<IClusterResponse[]>([]);
const isLoading = ref(true);
const isSubmitting = ref(false);

const showForm = ref(false);
const editingId = ref<number | null>(null);
const editingHasCaCert = ref(false);
const form = reactive({ name: '', apiUrl: '', serviceAccountToken: '', caCert: '' });

// The server never returns the stored token or cert, so there is nothing to prefill with.
const tokenPlaceholder = computed(() => (editingId.value ? '••••••••••••' : 'eyJhbGciOi...'));
const caCertPlaceholder = computed(() => (editingId.value && editingHasCaCert.value ? '•••• stored ••••' : '-----BEGIN CERTIFICATE-----'));

async function load() {
    try {
        isLoading.value = true;
        clusters.value = await dataFromAsync(ClustersApi.getClustersIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
}

function reset() {
    form.name = '';
    form.apiUrl = '';
    form.serviceAccountToken = '';
    form.caCert = '';
}

function openCreate() {
    editingId.value = null;
    editingHasCaCert.value = false;
    reset();
    showForm.value = true;
}

function openEdit(cluster: IClusterResponse) {
    editingId.value = cluster.id;
    editingHasCaCert.value = cluster.hasCaCert;
    reset();
    form.name = cluster.name;
    form.apiUrl = cluster.apiUrl;
    showForm.value = true;
}

async function submit() {
    try {
        isSubmitting.value = true;

        if (editingId.value) {
            const caCert = form.caCert.trim();
            await dataFromAsync(
                ClustersApi.putClustersUpdate({
                    path: { id: editingId.value },
                    body: {
                        name: form.name,
                        apiUrl: form.apiUrl,
                        // Both secrets are write-only: omit when blank so a rename can't wipe the
                        // stored token or CA cert. Send a value only when the user typed one.
                        ...(form.serviceAccountToken ? { serviceAccountToken: form.serviceAccountToken } : {}),
                        ...(caCert ? { caCert } : {})
                    }
                })
            );
        } else {
            await dataFromAsync(
                ClustersApi.postClustersCreate({
                    body: { name: form.name, apiUrl: form.apiUrl, serviceAccountToken: form.serviceAccountToken, caCert: form.caCert.trim() || null }
                })
            );
        }

        showForm.value = false;
        await load();
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isSubmitting.value = false;
    }
}

async function destroy(cluster: IClusterResponse) {
    const confirmed = await showConfirmDestroy('Delete cluster', `Delete "${cluster.name}"?`);
    if (!confirmed) return;

    try {
        await dataFromAsync(ClustersApi.deleteClustersDestroy({ path: { id: cluster.id } }));
        await load();
    } catch (err) {
        handleErrorAndAlert(err);
    }
}

onMounted(load);
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#clusters {
    @apply flex flex-col gap-4;
}

.header {
    @apply flex items-start justify-between;
}

.subtitle {
    @apply text-sm text-neutral-500;
}

.empty {
    @apply flex flex-col items-center gap-2 py-12 text-neutral-500 text-center;

    i {
        @apply text-3xl;
    }
}

table {
    @apply w-full text-sm border-collapse;

    th,
    td {
        @apply text-left px-3 py-2 border-b border-neutral-500/25;
    }

    th {
        @apply text-xs uppercase tracking-wide text-neutral-500 font-medium;
    }

    .name {
        @apply font-medium;
    }

    .row-actions {
        @apply flex gap-2 justify-end;
    }
}

.form-modal {
    @apply flex flex-col gap-3 w-[520px];

    form {
        @apply flex flex-col gap-3 mt-2;
    }

    .hint {
        @apply text-xs text-neutral-500;
    }

    .actions {
        @apply flex justify-end gap-2 mt-2;
    }
}
</style>
