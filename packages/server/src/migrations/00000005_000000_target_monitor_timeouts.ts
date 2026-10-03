import { createMigration } from '@zyno-io/ts-server-foundation';

export default createMigration(async db => {
    await db.rawExecute(`
        ALTER TABLE "apps_environment_targets"
        ADD COLUMN "monitorTimeoutSecs" INTEGER NULL
        CHECK ("monitorTimeoutSecs" > 0)
    `);
    // Historical snapshots predate target budgets. Use the previous built-in default;
    // every new deployment explicitly captures its resolved budget instead.
    await db.rawExecute(`
        ALTER TABLE "apps_deployment_targets"
        ADD COLUMN "monitorTimeoutSecs" INTEGER NOT NULL DEFAULT 300
        CHECK ("monitorTimeoutSecs" > 0)
    `);
    await db.rawExecute(`ALTER TABLE "apps_deployment_targets" ALTER COLUMN "monitorTimeoutSecs" DROP DEFAULT`);
});
