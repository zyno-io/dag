import type { Page } from '@playwright/test';

import { statSync } from 'node:fs';

import { appDetail, apps, clusters, deploymentDetail, deployments, iacs, ids, liveDeployment, sessionUser } from './fixtures';

// A syntactically-valid unsigned JWT. The app only checks for the key's presence to pass the
// router guard; the server (which would reject it) is never contacted — every route is mocked.
const FAKE_JWT = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ2cnQifQ.';
const AUTH_KEY = 'dag:jwt';
const THEME_KEY = 'dag:theme';

/** Wrap page.route() in a small JSON-fulfilling helper. */
export async function json(page: Page, urlPattern: string | RegExp, body: unknown, status = 200): Promise<void> {
    await page.route(urlPattern, route =>
        route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body)
        })
    );
}

/**
 * Stamp the JWT the app reads from localStorage and force light theme before any navigation, so
 * the layout renders authenticated and in a deterministic palette.
 */
export async function setupAuth(page: Page): Promise<void> {
    await page.addInitScript(
        ([authKey, jwt, themeKey]) => {
            try {
                window.localStorage.setItem(authKey, jwt);
                window.localStorage.setItem(themeKey, 'light');
            } catch {
                /* localStorage unavailable in some contexts */
            }
        },
        [AUTH_KEY, FAKE_JWT, THEME_KEY]
    );
}

/** Force light theme without authenticating — for the login screen. */
export async function forceLightTheme(page: Page): Promise<void> {
    await page.addInitScript(themeKey => {
        try {
            window.localStorage.setItem(themeKey, 'light');
        } catch {
            /* noop */
        }
    }, THEME_KEY);
}

/** Everything app.vue and the layout fire on load — run on every authenticated test. */
export async function setupBaseMocks(page: Page): Promise<void> {
    await json(page, '**/api/session/me', sessionUser);
    // Drives store.isOperator (a 'manage' role reveals the infrastructure menu).
    await json(page, '**/api/iacs', iacs);
}

export async function mockAppsRoutes(page: Page): Promise<void> {
    await json(page, /\/api\/apps(\?.*)?$/, apps);
}

export async function mockAppDetailRoutes(page: Page): Promise<void> {
    await json(page, `**/api/apps/${ids.appId}`, appDetail);
    await json(
        page,
        /\/api\/deployments(\?.*)?$/,
        deployments.filter(d => d.appId === ids.appId)
    );
}

export async function mockDeploymentsRoutes(page: Page): Promise<void> {
    await json(page, /\/api\/apps(\?.*)?$/, apps);
    await json(page, /\/api\/deployments(\?.*)?$/, deployments);
}

export async function mockDeploymentDetailRoutes(page: Page): Promise<void> {
    await json(page, `**/api/deployments/${deploymentDetail.id}`, deploymentDetail);
}

/**
 * The live deployment view opens an EventSource against the events endpoint. Fulfil it with a
 * text/event-stream body of non-terminal status frames so the timeline and "Live" banner render
 * deterministically (the client keeps the stream open on non-terminal statuses).
 */
export async function mockLiveDeploymentRoutes(page: Page): Promise<void> {
    await json(page, `**/api/deployments/${liveDeployment.id}`, liveDeployment);
    await page.route(`**/api/deployments/${liveDeployment.id}/events`, route =>
        route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body:
                `event: status\ndata: ${JSON.stringify({ status: 'pushed', message: 'Pushed chart to prod-infra' })}\n\n` +
                `event: status\ndata: ${JSON.stringify({ status: 'monitoring', message: 'Waiting for HelmRelease to become ready' })}\n\n`
        })
    );
}

export async function mockClustersRoutes(page: Page): Promise<void> {
    await json(page, /\/api\/clusters(\?.*)?$/, clusters);
}

export async function mockIacsRoutes(page: Page): Promise<void> {
    await json(page, '**/api/iacs', iacs);
}

/**
 * Catch blank/black screenshots before they pollute baselines. A fully-rendered page reliably
 * exceeds ~8kB; a blank white page is under 5kB.
 */
export function expectMinScreenshotSize(path: string, minBytes: number): void {
    const size = statSync(path).size;
    if (size < minBytes) {
        throw new Error(
            `Screenshot too small: ${path} is ${size} bytes (min ${minBytes}). ` +
                'This usually means the page rendered blank or the layout failed to hydrate.'
        );
    }
}

export const SCREENSHOTS_DIR = 'screenshots';
