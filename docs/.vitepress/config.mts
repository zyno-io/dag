import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'DAG',
    description: 'Deploy via GitOps — push Helm charts to IAC repos and monitor Kubernetes deployments',
    base: '/dag/',

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/getting-started' },
            { text: 'Reference', link: '/server/api' }
        ],

        sidebar: [
            {
                text: 'Introduction',
                items: [
                    { text: 'What is DAG?', link: '/' },
                    { text: 'Getting Started', link: '/getting-started' },
                    { text: 'Architecture', link: '/architecture' },
                    { text: 'Helm Chart', link: '/deployment/helm-chart' }
                ]
            },
            {
                text: 'Server',
                items: [
                    { text: 'Configuration', link: '/server/configuration' },
                    { text: 'API', link: '/server/api' }
                ]
            },
            {
                text: 'CLI',
                items: [
                    { text: 'dag-deploy', link: '/cli/dag-deploy' },
                    { text: 'dag-inject-values', link: '/cli/dag-inject-values' },
                    { text: 'CI Integration', link: '/cli/ci-integration' }
                ]
            },
            {
                text: 'Guides',
                items: [
                    { text: 'IAC Repositories', link: '/guides/iac-repos' },
                    { text: 'Clusters', link: '/guides/clusters' },
                    { text: 'Creating Apps', link: '/guides/creating-apps' },
                    { text: 'App Charts', link: '/guides/app-charts' }
                ]
            },
            {
                text: 'Reference',
                items: [{ text: 'Status Lifecycle', link: '/reference/status-lifecycle' }]
            }
        ],

        socialLinks: [{ icon: 'github', link: 'https://github.com/zyno-io/dag' }]
    }
});
