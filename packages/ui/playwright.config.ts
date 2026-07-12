import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30 * 1000,
    expect: { timeout: 5000 },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'html',
    use: {
        actionTimeout: 0,
        baseURL: 'http://localhost:3001',
        trace: 'on-first-retry',
        headless: !!process.env.CI,
        video: 'retain-on-failure',
        timezoneId: 'UTC',
        locale: 'en-US'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Deterministic font rendering so screenshots are stable across machines.
                launchOptions: {
                    args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning']
                }
            }
        }
    ],
    outputDir: 'test-results/',
    webServer: {
        // Hermetic: the suite mocks every /api call and stamps a fake JWT, so only the Vite dev
        // server is needed — no backend, database, or GitLab.
        command: 'yarn dev',
        port: 3001,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000
    }
});
