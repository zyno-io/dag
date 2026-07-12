import { http, HttpNotFoundError } from '@zyno-io/ts-server-foundation';

/**
 * Serving the UI means every unmatched GET falls back to index.html — including `/api/typo`,
 * which would answer 200 with an HTML page instead of a 404. That is fine for a browser
 * navigating to a client-side route, but wrong for an API: the CLI and the generated client
 * would try to parse a web page as JSON.
 *
 * These routes claim the unmatched GETs under /api so the static fallback never sees them. They
 * only ever match when no real route did — the router returns the first registered match, and
 * this controller is registered last (see app.ts). Only GET needs covering, since that is the
 * only method the static handler intercepts.
 *
 * A path parameter matches a single segment, so there is one route per depth rather than one
 * wildcard: depth 0 catches a bare /api, and depths 1–5 cover everything up to and beyond the
 * deepest real API path (/api/apps/:appId/environments/:id, four segments).
 */
@http.controller('/api')
export class ApiFallbackController {
    @http.GET()
    depth0(): never {
        throw new HttpNotFoundError();
    }

    @http.GET(':a')
    depth1(): never {
        throw new HttpNotFoundError();
    }

    @http.GET(':a/:b')
    depth2(): never {
        throw new HttpNotFoundError();
    }

    @http.GET(':a/:b/:c')
    depth3(): never {
        throw new HttpNotFoundError();
    }

    @http.GET(':a/:b/:c/:d')
    depth4(): never {
        throw new HttpNotFoundError();
    }

    @http.GET(':a/:b/:c/:d/:e')
    depth5(): never {
        throw new HttpNotFoundError();
    }
}
