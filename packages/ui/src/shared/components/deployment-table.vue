<template>
    <div class="deployment-table">
        <div v-if="!deployments.length" class="empty">{{ emptyText }}</div>

        <table v-else>
            <thead>
                <tr>
                    <th>Status</th>
                    <th v-if="showApp">App</th>
                    <th>Environment</th>
                    <th>Version</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th />
                </tr>
            </thead>
            <tbody>
                <tr v-for="deployment in deployments" :key="deployment.id" @click="open(deployment)">
                    <td><StatusChip :status="deployment.status" /></td>
                    <td v-if="showApp">{{ deployment.appName }}</td>
                    <td>
                        {{ deployment.environmentName }}
                        <span class="branch">{{ deployment.branch }}</span>
                    </td>
                    <td class="mono">{{ deployment.version }}</td>
                    <td :title="new Date(deployment.createdAt).toString()">{{ formatRelative(deployment.createdAt) }}</td>
                    <td>{{ formatDuration(deployment) }}</td>
                    <td class="chevron"><i class="fa fa-chevron-right" /></td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script lang="ts" setup>
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'vue-router';

import type { IDeploymentResponse } from '@/openapi-client-generated';

import StatusChip from '@/shared/components/status-chip.vue';
import { isTerminal } from '@/shared/deployment-status';

withDefaults(
    defineProps<{
        deployments: IDeploymentResponse[];
        emptyText?: string;
        showApp?: boolean;
    }>(),
    { emptyText: 'No deployments.', showApp: false }
);

const router = useRouter();

function open(deployment: IDeploymentResponse) {
    router.push({ name: 'deployment', params: { deploymentId: deployment.id } });
}

function formatRelative(date: string | Date): string {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function formatDuration(deployment: IDeploymentResponse): string {
    // While in flight, updatedAt is just the last status change — not an end time.
    if (!isTerminal(deployment.status)) return '—';

    const seconds = Math.max(0, Math.round((new Date(deployment.updatedAt).getTime() - new Date(deployment.createdAt).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

.empty {
    @apply py-8 text-center text-sm text-neutral-500 border border-neutral-500/25 rounded-lg;
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

    tbody tr {
        @apply cursor-pointer hover:bg-neutral-100;
    }

    .branch {
        @apply ml-1.5 text-xs text-neutral-500;
    }

    .chevron {
        @apply text-neutral-400 text-xs w-6;
    }
}

html.dark table tbody tr:hover {
    @apply bg-neutral-800;
}
</style>
