import { defineStore } from 'pinia';

import type { ISessionResponse } from './openapi-client-generated';

export const useStore = defineStore('root', {
    state: () => ({
        sessionUser: null as ISessionResponse | null,
        globalError: null as string | null,
        /**
         * True when the user holds `manage` on at least one IaC repo. That — and nothing local —
         * is what makes someone an operator, so it also gates cluster management.
         */
        isOperator: false
    })
});
