import { dataFromAsync } from '@zyno-io/openapi-client-codegen';
import { defineStore } from 'pinia';

import { IacsApi, type IIacResponse, type ISessionResponse } from './openapi-client-generated';

export const useStore = defineStore('root', {
    state: () => ({
        sessionUser: null as ISessionResponse | null,
        globalError: null as string | null,
        /**
         * True when the user holds `manage` on at least one IaC repo. That — and nothing local —
         * is what makes someone an operator, so it also gates cluster management.
         */
        isOperator: false,
        /** Preloaded after authentication so environment forms can use consistent IaC options. */
        manageableIacs: [] as IIacResponse[]
    }),
    actions: {
        async loadManageableIacs(): Promise<void> {
            const iacs = await dataFromAsync(IacsApi.getIacsIndex());
            this.manageableIacs = iacs.filter(iac => iac.role === 'manage');
            this.isOperator = this.manageableIacs.length > 0;
        },

        clearManageableIacs(): void {
            this.manageableIacs = [];
            this.isOperator = false;
        }
    }
});
