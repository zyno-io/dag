<template>
    <div class="loader">
        <i class="fa fa-spinner fa-spin" />
    </div>
</template>

<style lang="scss" scoped>
@reference "tailwindcss";

.loader {
    @apply flex items-center justify-center py-12 text-neutral-500;
    i {
        @apply text-2xl;
    }
}
</style>
