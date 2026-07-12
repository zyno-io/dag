<template>
    <div id="iacs">
        <div class="header">
            <h1>IaC repositories</h1>
            <p class="subtitle">
                Provisioned out of band — they hold the credentials DAG writes your infrastructure with. Your role on each comes straight from GitLab.
            </p>
        </div>

        <LoaderModal v-if="isLoading" />

        <div v-else-if="!iacs.length" class="empty">
            <i class="fa fa-book" />
            <h2>No IaC repositories</h2>
            <p>Either none are configured, or you have no GitLab access to the ones that are.</p>
        </div>

        <table v-else>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Repository</th>
                    <th>Your role</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="iac in iacs" :key="iac.id">
                    <td class="name">{{ iac.name }}</td>
                    <td>
                        <a :href="iac.repoUrl" target="_blank" rel="noopener">{{ iac.repoUrl }}</a>
                    </td>
                    <td>
                        <span class="role" :class="iac.role">{{ ROLE_LABELS[iac.role] }}</span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert } from '@zyno-io/vue-foundation';
import { onMounted, ref } from 'vue';

import { IacsApi, type IIacResponse } from '@/openapi-client-generated';
import LoaderModal from '@/shared/components/loader-modal.vue';

const ROLE_LABELS: Record<string, string> = {
    read: 'Read',
    operate: 'Operate',
    manage: 'Manage'
};

const iacs = ref<IIacResponse[]>([]);
const isLoading = ref(true);

onMounted(async () => {
    try {
        iacs.value = await dataFromAsync(IacsApi.getIacsIndex());
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
});
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#iacs {
    @apply flex flex-col gap-4;
}

.subtitle {
    @apply text-sm text-neutral-500 max-w-2xl mt-1;
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
}

.role {
    @apply text-xs uppercase tracking-wide px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-900;

    &.manage {
        @apply bg-green-200 text-green-900;
    }

    &.operate {
        @apply bg-blue-200 text-blue-900;
    }
}
</style>
