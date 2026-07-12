import { TestingHelpers } from '@zyno-io/ts-server-foundation';

import { CoreAppOptions } from '../../app';

TestingHelpers.setDefaultDatabaseConfig({
    PG_HOST: 'localhost',
    PG_PORT: 5432,
    PG_USER: 'dag',
    PG_PASSWORD_SECRET: 'dag'
});

/**
 * The migrations directory has to be named explicitly. The foundation defaults to
 * `src/migrations` and maps it to `dist/src/migrations`, but this package compiles with
 * `rootDir: "./src"`, so the compiled migrations land in `dist/migrations`. Without this the
 * migrator silently finds zero migrations and every test hits an empty schema.
 */
export const MIGRATIONS_DIR = 'dist/migrations';

export function createTestingFacade() {
    return TestingHelpers.createTestingFacade(CoreAppOptions, {
        enableDatabase: true,
        enableMigrations: true,
        migrationsDir: MIGRATIONS_DIR,
        dbAdapter: 'postgres'
    });
}
