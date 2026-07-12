<template>
    <span class="status-chip" :class="status">
        <i v-if="isInFlight" class="fa fa-circle-notch fa-spin" />
        <i v-else-if="status === 'deployed'" class="fa fa-check" />
        <i v-else-if="status === 'failed'" class="fa fa-xmark" />
        {{ status }}
    </span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

import { IN_FLIGHT_STATUSES, type DeploymentStatus } from '@/shared/deployment-status';

const props = defineProps<{ status: DeploymentStatus }>();

const isInFlight = computed(() => IN_FLIGHT_STATUSES.includes(props.status));
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

.status-chip {
    @apply inline-flex items-center gap-1.5 text-xs uppercase tracking-wide px-2 py-0.5 rounded-md;
    @apply bg-neutral-200 text-neutral-900;

    &.deployed {
        @apply bg-green-200 text-green-900;
    }
    &.failed {
        @apply bg-red-200 text-red-900;
    }
    &.monitoring,
    &.pushed {
        @apply bg-blue-200 text-blue-900;
    }
    &.pending,
    &.validating,
    &.pushing {
        @apply bg-amber-200 text-amber-900;
    }
}
</style>
