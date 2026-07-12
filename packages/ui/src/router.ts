import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { LOCAL_STORAGE_AUTH_KEY } from './openapi-client';
import AppView from './screens/app.vue';
import Apps from './screens/apps.vue';
import Clusters from './screens/clusters.vue';
import DeploymentView from './screens/deployment.vue';
import Deployments from './screens/deployments.vue';
import Iacs from './screens/iacs.vue';
import Login from './screens/login.vue';

const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/apps' },
    { path: '/login', name: 'login', component: Login, meta: { public: true } },
    { path: '/apps', name: 'apps', component: Apps },
    { path: '/apps/:appId', name: 'app', component: AppView },
    { path: '/deployments', name: 'deployments', component: Deployments },
    { path: '/deployments/:deploymentId', name: 'deployment', component: DeploymentView },
    { path: '/clusters', name: 'clusters', component: Clusters },
    { path: '/iacs', name: 'iacs', component: Iacs }
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
});

router.beforeEach(to => {
    if (to.meta.public) return;
    if (!localStorage.getItem(LOCAL_STORAGE_AUTH_KEY)) {
        return { name: 'login', query: { returnPath: to.fullPath } };
    }
});

export default router;
