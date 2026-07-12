import { expect, test } from '@playwright/test';

import { VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockDeploymentsRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('deployments list page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockDeploymentsRoutes(page);

    await page.goto('/deployments');

    await expect(page.getByRole('heading', { name: 'Deployments' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/deployments.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 10_000);
});
