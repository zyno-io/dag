import { expect, test } from '@playwright/test';

import { VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockClustersRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('clusters page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockClustersRoutes(page);

    await page.goto('/clusters');

    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/clusters.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 9_000);
});
