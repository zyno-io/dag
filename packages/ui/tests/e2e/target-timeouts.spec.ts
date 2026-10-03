import { expect, test } from '@playwright/test';

import { appDetail, ids } from './fixtures';
import { json, mockAppDetailRoutes, setupAuth, setupBaseMocks } from './helpers';

test('edits independent target budgets and can restore the server default', async ({ page }) => {
    await setupAuth(page);
    await setupBaseMocks(page);
    await mockAppDetailRoutes(page);
    let detail = structuredClone(appDetail);
    const targets = detail.environments[0].targets;
    await json(
        page,
        '**/api/clusters',
        targets.map(target => ({ id: target.clusterId, name: target.clusterName, apiUrl: 'https://k8s.example.test' }))
    );
    await page.route(`**/api/apps/${ids.appId}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail) }));
    const budgets: Array<Array<number | null>> = [];
    await page.route(`**/api/apps/${ids.appId}/environments/1`, async route => {
        const body = route.request().postDataJSON();
        budgets.push(body.targets.map((target: { monitorTimeoutSecs: number | null }) => target.monitorTimeoutSecs));
        detail.environments[0].targets = targets.map((target, index) => ({ ...target, ...body.targets[index] }));
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail.environments[0]) });
    });
    await page.goto(`/apps/${ids.appId}`);
    const edit = page.locator('.environment').first().getByRole('button', { name: 'Edit', exact: true });
    await edit.click();
    const inputs = page.getByLabel('Rollout timeout (seconds)', { exact: false });
    await expect(inputs).toHaveCount(2);
    await expect(inputs.nth(0)).toHaveValue('');
    await inputs.nth(0).fill('0');
    const valid = await inputs.nth(0).evaluate(input => (input as HTMLInputElement).checkValidity());
    expect(valid).toBe(false);
    await inputs.nth(0).fill('600');
    await inputs.nth(1).fill('28800');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit environment' })).toHaveCount(0);
    expect(budgets).toEqual([[600, 28800]]);
    await edit.click();
    await expect(inputs.nth(0)).toHaveValue('600');
    await expect(inputs.nth(1)).toHaveValue('28800');
    await inputs.nth(0).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit environment' })).toHaveCount(0);
    expect(budgets).toEqual([
        [600, 28800],
        [null, 28800]
    ]);
});
