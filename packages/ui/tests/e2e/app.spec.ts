import { expect, test } from '@playwright/test';

import { ids, VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockAppDetailRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('app detail page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockAppDetailRoutes(page);

    await page.goto(`/apps/${ids.appId}`);

    await expect(page.getByRole('heading', { name: 'checkout-service' })).toBeVisible();
    await expect(page.locator('.environment')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Recent deployments' })).toBeVisible();
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/app.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 10_000);
});
