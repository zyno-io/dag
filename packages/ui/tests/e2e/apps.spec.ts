import { expect, test } from '@playwright/test';

import { VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockAppsRoutes, mockClustersRoutes, mockIacsRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('apps list page', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockAppsRoutes(page);

    await page.goto('/apps');

    await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
    await expect(page.locator('.app')).toHaveCount(3);
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/apps.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 10_000);
});

test('apps list search', async ({ page }) => {
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockAppsRoutes(page);

    await page.goto('/apps');

    const search = page.getByRole('searchbox', { name: 'Search apps' });
    await search.fill('BILLING');
    await expect(page.locator('.app')).toHaveCount(1);
    await expect(page.locator('.app')).toContainText('billing-api');

    await search.fill('example.com/acme/web');
    await expect(page.locator('.app')).toHaveCount(1);
    await expect(page.locator('.app')).toContainText('web-frontend');

    await search.fill('missing-app');
    await expect(page.getByRole('heading', { name: 'No matching apps' })).toBeVisible();
});

test('apps — add app modal', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockAppsRoutes(page);
    await mockIacsRoutes(page);
    await mockClustersRoutes(page);

    await page.goto('/apps');
    await page.getByRole('button', { name: 'Add app' }).click();

    await expect(page.locator('.vf-modal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add app' })).toBeVisible();
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/apps-add-modal.png`;
    await page.locator('.vf-modal').screenshot({ path });
    expectMinScreenshotSize(path, 6_000);
});
