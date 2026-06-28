import { createMigration } from '@zyno-io/dk-server-foundation';

export default createMigration(async db => {
    await db.rawExecute(`ALTER TABLE "apps_environments" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255)`);
    await db.rawExecute(`UPDATE "apps_environments" SET "name" = "branch" WHERE "name" IS NULL`);
    await db.rawExecute(`ALTER TABLE "apps_environments" ALTER COLUMN "name" SET NOT NULL`);
    await db.rawExecute(`DROP INDEX IF EXISTS "idx_apps_environments_appId_branch"`);
    await db.rawExecute(`DROP INDEX IF EXISTS "idx_apps_environments_appId_branch_name"`);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_apps_environments_appId_branch_name" ON "apps_environments" ("appId", "branch", "name")`);
});
