import { createMigration } from '@zyno-io/ts-server-foundation';

export default createMigration(async db => {
    // Table: users — created on first GitLab OAuth login. There are no local roles;
    // every permission is resolved live from the user's GitLab access to an IaC repo.
    await db.rawExecute(`
        CREATE TABLE "users" (
            "id" CHAR(36) NOT NULL,
            "gitlabUserId" VARCHAR(255) NOT NULL,
            "username" VARCHAR(255) NOT NULL,
            "name" VARCHAR(255) NOT NULL,
            "avatarUrl" VARCHAR(255),
            "gitlabSession" JSONB,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "lastLoginAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_users_gitlabUserId" ON "users" ("gitlabUserId")`);

    // apps.name — the UI needs something to title an app with; repoUrl is all we had.
    await db.rawExecute(`ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "name" VARCHAR(255)`);
    await db.rawExecute(`
        UPDATE "apps"
        SET "name" = regexp_replace(regexp_replace(regexp_replace("repoUrl", '/+$', ''), '^.*/', ''), '\\.git$', '')
        WHERE "name" IS NULL
    `);
    await db.rawExecute(`UPDATE "apps" SET "name" = "repoUrl" WHERE "name" IS NULL OR "name" = ''`);
    await db.rawExecute(`ALTER TABLE "apps" ALTER COLUMN "name" SET NOT NULL`);

    // The deployment list/history view is the one new query pattern, and neither
    // column was indexed.
    await db.rawExecute(`
        CREATE INDEX "idx_apps_deployments_appEnvironmentId_createdAt"
        ON "apps_deployments" ("appEnvironmentId", "createdAt" DESC)
    `);

    // The app's own commit SHA is known at deploy time but was only ever written into
    // the IaC commit message. Persist it so the UI can show what shipped.
    await db.rawExecute(`ALTER TABLE "apps_deployments" ADD COLUMN IF NOT EXISTS "sourceCommitSha" VARCHAR(255)`);
});
