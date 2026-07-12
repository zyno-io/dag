import { expect, test } from '@playwright/test';

import { deploymentDetail, ids, liveDeployment, VRT_NOW } from './fixtures';
import { expectMinScreenshotSize, mockDeploymentDetailRoutes, mockLiveDeploymentRoutes, SCREENSHOTS_DIR, setupAuth, setupBaseMocks } from './helpers';

test('deployment detail — terminal', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockDeploymentDetailRoutes(page);

    await page.goto(`/deployments/${ids.deploymentId}`);

    await expect(page.getByRole('heading', { name: deploymentDetail.version })).toBeVisible();
    await expect(page.locator('.status-chip')).toContainText('deployed');
    await page.waitForTimeout(300);

    const path = `${SCREENSHOTS_DIR}/deployment.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 9_000);
});

test('deployment detail — live', async ({ page }) => {
    await page.clock.install({ time: VRT_NOW });
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockLiveDeploymentRoutes(page);

    await page.goto(`/deployments/${liveDeployment.id}`);

    await expect(page.getByRole('heading', { name: liveDeployment.version })).toBeVisible();
    await expect(page.locator('.live-banner')).toBeVisible();
    await page.waitForTimeout(500);

    const path = `${SCREENSHOTS_DIR}/deployment-live.png`;
    await page.screenshot({ path, fullPage: true });
    expectMinScreenshotSize(path, 9_000);
});
