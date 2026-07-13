<template>
    <div id="page-wrapper">
        <nav>
            <a class="title" @click="$router.push('/')">DAG</a>

            <div class="nav-links">
                <RouterLink to="/apps">Apps</RouterLink>
                <RouterLink to="/deployments">Deployments</RouterLink>
            </div>

            <div class="nav-right">
                <a class="nav-icon" :title="isDark ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
                    <i :class="isDark ? 'fa fa-sun' : 'fa fa-moon'" />
                </a>

                <!-- Infrastructure is only meaningful to someone who can manage an IaC repo. -->
                <div v-if="store.isOperator" class="admin-dropdown">
                    <i class="fa fa-gear" />
                    <div class="dropdown-menu">
                        <RouterLink to="/clusters" class="dropdown-item">Clusters</RouterLink>
                        <RouterLink to="/iacs" class="dropdown-item">IaC repositories</RouterLink>
                    </div>
                </div>

                <span class="user">{{ store.sessionUser?.name }}</span>
                <a class="logout" title="Log out" @click="logout"><i class="fa fa-right-from-bracket" /></a>
            </div>
        </nav>

        <main>
            <slot />
        </main>
    </div>
</template>

<script lang="ts" setup>
import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { onMounted, onUnmounted, ref } from 'vue';

import { LOCAL_STORAGE_AUTH_KEY } from '@/openapi-client';
import { SessionApi } from '@/openapi-client-generated';
import { useStore } from '@/store';

const store = useStore();

const THEME_OVERRIDE_KEY = 'dag:theme';
const isDark = ref(document.documentElement.classList.contains('dark'));
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(dark: boolean) {
    isDark.value = dark;
    document.documentElement.classList.toggle('dark', dark);
}

function toggleTheme() {
    const next = !isDark.value;
    // Only persist a choice that diverges from the system preference, so toggling back to
    // match the system hands control back to it.
    if (next === mediaQuery.matches) {
        localStorage.removeItem(THEME_OVERRIDE_KEY);
    } else {
        localStorage.setItem(THEME_OVERRIDE_KEY, next ? 'dark' : 'light');
    }
    applyTheme(next);
}

function onSystemThemeChange(e: MediaQueryListEvent) {
    if (!localStorage.getItem(THEME_OVERRIDE_KEY)) applyTheme(e.matches);
}

async function logout() {
    try {
        // Invalidate cached source/IaC grants while the JWT is still available. If the server
        // cannot be reached, local logout must still succeed.
        await dataFromAsync(SessionApi.postSessionLogout());
    } catch {
        // Nothing actionable for the user: the local session is cleared below either way.
    } finally {
        store.sessionUser = null;
        store.isOperator = false;
        localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
    }
}

onMounted(() => mediaQuery.addEventListener('change', onSystemThemeChange));
onUnmounted(() => mediaQuery.removeEventListener('change', onSystemThemeChange));
</script>

<style lang="scss" scoped>
@reference "tailwindcss";

#page-wrapper {
    @apply flex-1 flex flex-col;
}

nav {
    @apply px-6 py-4 border-b border-neutral-500/25 flex items-center gap-6;

    .title {
        @apply text-lg font-semibold cursor-pointer select-none no-underline;
        color: inherit;
    }

    .nav-links {
        @apply flex items-center gap-4 text-sm;

        a {
            @apply text-neutral-500 no-underline hover:text-neutral-800;

            &.router-link-active {
                @apply text-neutral-900 font-medium;
            }
        }
    }

    .nav-right {
        @apply ml-auto flex items-center gap-4;
    }

    .user {
        @apply text-sm text-neutral-500;
    }

    .nav-icon,
    .logout {
        @apply cursor-pointer text-neutral-500 hover:text-neutral-700 no-underline;
    }

    .admin-dropdown {
        @apply relative cursor-pointer;

        > i {
            @apply text-neutral-500 hover:text-neutral-700;
        }

        .dropdown-menu {
            @apply absolute right-0 top-full z-50 mt-2 py-1 bg-white border border-neutral-500/25 rounded-md shadow-lg min-w-[180px] opacity-0 invisible transition-all duration-100;
        }

        &:hover .dropdown-menu {
            @apply opacity-100 visible;
        }

        .dropdown-item {
            @apply block px-4 py-2 text-sm text-neutral-700 no-underline hover:bg-neutral-100;
        }
    }
}

main {
    @apply flex-1 p-6 max-w-6xl w-full mx-auto;
}

html.dark nav .nav-links a {
    @apply text-neutral-400 hover:text-neutral-200;

    &.router-link-active {
        @apply text-neutral-100;
    }
}

html.dark nav .nav-icon,
html.dark nav .logout,
html.dark nav .admin-dropdown > i {
    @apply text-neutral-400 hover:text-neutral-200;
}

html.dark nav .admin-dropdown .dropdown-menu {
    @apply bg-neutral-800 border-neutral-700;
}

html.dark nav .admin-dropdown .dropdown-item {
    @apply text-neutral-200 hover:bg-neutral-700;
}
</style>
