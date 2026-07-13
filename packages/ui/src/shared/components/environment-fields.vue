<template>
    <div class="environment-fields">
        <div class="row">
            <label>
                Environment name
                <input v-model="model.name" type="text" required placeholder="production" />
            </label>

            <label>
                App branch
                <input v-model="model.branch" type="text" required placeholder="main" />
                <span class="hint">The branch whose CI pipeline deploys this environment.</span>
            </label>
        </div>

        <label>
            IaC repository
            <VfSmartSelect
                v-model="model.iacId"
                :options="iacs"
                :key-field="'id'"
                :value-field="'id'"
                :label-field="'name'"
                :search-fields="['name', 'repoUrl']"
                placeholder="Select a repository..."
                required
            />
            <span class="hint">Only repositories you can maintain in GitLab are listed. This is what decides who can manage this environment.</span>
        </label>

        <div class="row">
            <label>
                Chart path in IaC repo
                <input v-model="model.iacPath" type="text" required placeholder="charts/my-service" />
            </label>

            <label>
                IaC branch
                <input :value="model.iacBranch ?? ''" type="text" placeholder="(default branch)" @input="setNullable('iacBranch', $event)" />
            </label>
        </div>

        <label>
            Cluster
            <VfSmartSelect
                v-model="model.clusterId"
                :options="clusters"
                :key-field="'id'"
                :value-field="'id'"
                :label-field="'name'"
                :search-fields="['name', 'apiUrl']"
                placeholder="Select a cluster..."
                required
            />
        </label>

        <div class="row">
            <label>
                Helm type
                <VfSmartSelect
                    v-model="model.helmType"
                    :options="HELM_TYPE_OPTIONS"
                    :key-field="'value'"
                    :value-field="'value'"
                    :label-field="'label'"
                    required
                />
            </label>

            <label>
                Helm release name
                <input :value="model.helmName ?? ''" type="text" placeholder="my-service" @input="setNullable('helmName', $event)" />
            </label>

            <label>
                Namespace
                <input :value="model.helmNamespace ?? ''" type="text" placeholder="default" @input="setNullable('helmNamespace', $event)" />
            </label>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { VfSmartSelect } from '@zyno-io/vue-foundation';

import type { IClusterResponse, IIacResponse } from '@/openapi-client-generated';
import type { EnvironmentForm } from '@/shared/environment-form';

const HELM_TYPE_OPTIONS: { value: EnvironmentForm['helmType']; label: string }[] = [
    { value: 'flux', label: 'Flux (HelmRelease)' },
    { value: 'plain', label: 'Plain Helm' }
];

defineProps<{
    iacs: IIacResponse[];
    clusters: IClusterResponse[];
}>();

const model = defineModel<EnvironmentForm>({ required: true });

/** These columns are nullable server-side; an empty input means "unset", not "empty string". */
function setNullable(field: 'iacBranch' | 'helmName' | 'helmNamespace', event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    model.value[field] = value || null;
}
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

.environment-fields {
    @apply flex flex-col gap-3;
}

.row {
    @apply flex gap-3;

    > label {
        @apply flex-1 min-w-0;
    }
}

.hint {
    @apply text-xs text-neutral-500;
}
</style>
