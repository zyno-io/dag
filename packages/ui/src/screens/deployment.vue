<template>
    <div id="deployment">
        <LoaderModal v-if="isLoading" />

        <template v-else-if="deployment">
            <div class="header">
                <div>
                    <div class="breadcrumb">
                        <RouterLink :to="{ name: 'app', params: { appId: deployment.appId } }">{{ deployment.appName }}</RouterLink>
                        <span>/</span>
                        <span>{{ deployment.environmentName }}</span>
                    </div>
                    <h1>{{ deployment.version }}</h1>
                </div>
                <StatusChip :status="status" />
            </div>

            <div v-if="isLive" class="live-banner">
                <i class="fa fa-tower-broadcast" />
                Live — this deployment is still running.
            </div>

            <dl class="facts">
                <div>
                    <dt>Branch</dt>
                    <dd>{{ deployment.branch }}</dd>
                </div>
                <div>
                    <dt>Started</dt>
                    <dd>{{ formatDate(deployment.createdAt) }}</dd>
                </div>
                <div>
                    <dt>CI job</dt>
                    <dd>
                        <a v-if="deployment.jobUrl" :href="deployment.jobUrl" target="_blank" rel="noopener">#{{ deployment.ciJobId }}</a>
                        <span v-else>#{{ deployment.ciJobId }}</span>
                    </dd>
                </div>
                <div>
                    <dt>App commit</dt>
                    <dd class="mono">{{ deployment.sourceCommitSha?.slice(0, 12) ?? '—' }}</dd>
                </div>
                <div>
                    <dt>IaC commit</dt>
                    <dd>
                        <a v-if="commitUrl" :href="commitUrl" target="_blank" rel="noopener" class="mono">view</a>
                        <span v-else>—</span>
                    </dd>
                </div>
            </dl>

            <section>
                <h2>Progress</h2>
                <ol class="timeline">
                    <li v-for="(entry, i) in timeline" :key="i" :class="entry.status">
                        <span class="dot" />
                        <div class="entry">
                            <span class="entry-status">{{ entry.status }}</span>
                            <span v-if="entry.message" class="entry-message">{{ entry.message }}</span>
                        </div>
                    </li>
                </ol>
            </section>
        </template>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { handleErrorAndAlert } from '@zyno-io/vue-foundation';
import { format } from 'date-fns';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { DeploymentsApi, type IDeploymentResponse } from '@/openapi-client-generated';
import LoaderModal from '@/shared/components/loader-modal.vue';
import StatusChip from '@/shared/components/status-chip.vue';
import { isTerminal, type DeploymentStatus } from '@/shared/deployment-status';

interface TimelineEntry {
    status: DeploymentStatus;
    message: string;
}

interface StatusEvent {
    status: DeploymentStatus;
    message: string;
    commitUrl?: string;
}

const route = useRoute();
const deploymentId = String(route.params.deploymentId);

const deployment = ref<IDeploymentResponse>();
const isLoading = ref(true);

const status = ref<DeploymentStatus>('pending');
const commitUrl = ref<string | null>(null);
const timeline = ref<TimelineEntry[]>([]);

let source: EventSource | undefined;

const isLive = computed(() => !isTerminal(status.value));

function formatDate(date: string | Date): string {
    return format(new Date(date), 'PPp');
}

function record(event: StatusEvent) {
    status.value = event.status;
    if (event.commitUrl) commitUrl.value = event.commitUrl;

    // The server re-sends the current status on connect and on every change; collapse repeats
    // so a slow poll doesn't fill the timeline with identical lines.
    const last = timeline.value[timeline.value.length - 1];
    if (last && last.status === event.status && last.message === event.message) return;

    timeline.value.push({ status: event.status, message: event.message });
}

/**
 * The same SSE endpoint the CLI streams. It replays the current status on connect and closes
 * itself once the deployment reaches a terminal state, so a finished deployment just yields one
 * event and a clean close.
 */
function stream() {
    source = new EventSource(`/api/deployments/${deploymentId}/events`);

    source.addEventListener('status', message => {
        try {
            record(JSON.parse((message as MessageEvent).data) as StatusEvent);
        } catch {
            // A malformed frame shouldn't tear down the stream.
        }

        if (isTerminal(status.value)) close();
    });

    source.addEventListener('error', () => {
        // EventSource retries on its own; only give up once there's nothing left to wait for.
        if (isTerminal(status.value)) close();
    });
}

function close() {
    source?.close();
    source = undefined;
}

onMounted(async () => {
    try {
        deployment.value = await dataFromAsync(DeploymentsApi.getDeploymentsShow({ path: { id: deploymentId } }));

        status.value = deployment.value.status;
        commitUrl.value = deployment.value.commitUrl;
        timeline.value = [{ status: deployment.value.status, message: deployment.value.statusMessage ?? '' }];

        // The SSE endpoint itself is unauthenticated (the CLI streams it with a bare EventSource,
        // which can't send a bearer token), so the id acts as a capability. We only reach it
        // after the authorized detail fetch above succeeds, and only when there's still something
        // to watch.
        if (isLive.value) stream();
    } catch (err) {
        handleErrorAndAlert(err);
    } finally {
        isLoading.value = false;
    }
});

onUnmounted(close);
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#deployment {
    @apply flex flex-col gap-6;
}

.header {
    @apply flex items-start justify-between;

    .breadcrumb {
        @apply flex items-center gap-2 text-xs text-neutral-500 mb-1;
    }
}

.live-banner {
    @apply flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-100 text-blue-900;
}

html.dark .live-banner {
    @apply bg-blue-950 text-blue-200;
}

.facts {
    @apply grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5;

    dt {
        @apply text-xs uppercase tracking-wide text-neutral-500;
    }

    dd {
        @apply text-sm mt-0.5;
    }
}

section {
    @apply flex flex-col gap-3;
}

.timeline {
    @apply flex flex-col gap-0 list-none p-0 m-0;

    li {
        @apply relative flex gap-3 pl-1 pb-4 last:pb-0;

        /* Connecting line between dots, stopping at the last entry. */
        &:not(:last-child)::before {
            content: '';
            @apply absolute left-[7px] top-3 bottom-0 w-px bg-neutral-500/30;
        }

        .dot {
            @apply mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-neutral-400 z-10;
        }

        &.deployed .dot {
            @apply bg-green-500;
        }

        &.failed .dot {
            @apply bg-red-500;
        }
    }

    .entry {
        @apply flex flex-col gap-0.5 -mt-0.5;
    }

    .entry-status {
        @apply text-xs uppercase tracking-wide text-neutral-500;
    }

    .entry-message {
        @apply text-sm;
    }
}
</style>
