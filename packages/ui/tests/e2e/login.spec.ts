import { expect, test } from '@playwright/test';

import { iacs, sessionUser, VRT_NOW } from './fixtures';
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

test('OAuth callback exchanges the code after initial router navigation', async ({ page }) => {
    await forceLightTheme(page);
    await json(page, '**/api/session/me', sessionUser);
    await json(page, '**/api/iacs', iacs);

    let loginRequests = 0;
    await page.route('**/api/session/login', async route => {
        loginRequests++;
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({ code: 'oauth-code', state: 'oauth-state' });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jwt: 'oauth-jwt', returnPath: '/login' })
        });
    });

    await page.goto('/login?code=oauth-code&state=oauth-state');

    await expect.poll(() => loginRequests).toBe(1);
    await expect(page).toHaveURL('/login');
    expect(await page.evaluate(() => localStorage.getItem('dag:jwt'))).toBe('oauth-jwt');
});
