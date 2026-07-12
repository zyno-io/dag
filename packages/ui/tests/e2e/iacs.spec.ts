import { expect, test } from '@playwright/test';

import { VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockIacsRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('iac repositories page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockIacsRoutes(page);

    await page.goto('/iacs');

    await expect(page.getByRole('heading', { name: 'IaC repositories' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/iacs.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 9_000);
});
