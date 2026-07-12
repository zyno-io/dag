import { expect, test } from '@playwright/test';

import { VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, forceLightTheme, json, SCREENSHOTS_DIR } from './helpers';

test('login page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    // No setupAuth — login is the unauthenticated state.
    await forceLightTheme(page);
    await json(page, '**/api/session/status', { isConfigured: true });

    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'DAG' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with GitLab/i })).toBeVisible();
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/login.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 8_000);
});
