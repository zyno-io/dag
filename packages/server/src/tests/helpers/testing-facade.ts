import { TestingHelpers } from '@zyno-io/dk-server-foundation';

import { CoreAppOptions } from '../../app';

TestingHelpers.setDefaultDatabaseConfig({
    PG_HOST: 'localhost',
    PG_PORT: 5432,
    PG_USER: 'dag',
    PG_PASSWORD_SECRET: 'dag'
});

export function createTestingFacade() {
    return TestingHelpers.createTestingFacade(CoreAppOptions, {
        enableDatabase: true,
        enableMigrations: true,
        dbAdapter: 'postgres'
    });
}
