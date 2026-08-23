import { createMigration } from '@zyno-io/ts-server-foundation';

export default createMigration(async db => {
    // Keep the original single-target columns for backwards-compatible API input and to avoid
    // invalidating historical application records. All new reads use this normalized table.
    await db.rawExecute(`
        CREATE TABLE "apps_environment_targets" (
            "id" SERIAL,
            "appEnvironmentId" DOUBLE PRECISION NOT NULL,
            "clusterId" DOUBLE PRECISION NOT NULL,
            "helmType" "apps_environments_helmType" NOT NULL,
            "helmNamespace" VARCHAR(255) NOT NULL,
            "helmName" VARCHAR(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);

    // A deployment must not accidentally monitor a pre-existing Helm target. Resolve Helm's
    // implicit defaults while backfilling so the database can enforce that invariant directly.
    await db.rawExecute(`
        INSERT INTO "apps_environment_targets" (
            "appEnvironmentId", "clusterId", "helmType", "helmNamespace", "helmName", "createdAt", "updatedAt"
        )
        SELECT
            "id",
            "clusterId",
            "helmType",
            COALESCE("helmNamespace", 'default'),
            COALESCE("helmName", regexp_replace("iacPath", '^.*/', '')),
            "createdAt",
            "updatedAt"
        FROM "apps_environments"
    `);
    await db.rawExecute(`
        CREATE UNIQUE INDEX "idx_apps_environment_targets_helm_target"
        ON "apps_environment_targets" ("clusterId", "helmType", "helmNamespace", "helmName")
    `);
    await db.rawExecute(`
        CREATE INDEX "idx_apps_environment_targets_appEnvironmentId"
        ON "apps_environment_targets" ("appEnvironmentId")
    `);

    await db.rawExecute(`
        DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apps_deployment_targets_status') THEN
            CREATE TYPE "apps_deployment_targets_status" AS ENUM ('pending', 'monitoring', 'deployed', 'failed');
        END IF;
        END $$
    `);
    await db.rawExecute(`CREATE CAST (text AS "apps_deployment_targets_status") WITH INOUT AS IMPLICIT`);
    await db.rawExecute(`
        CREATE TABLE "apps_deployment_targets" (
            "id" CHAR(36) NOT NULL,
            "deploymentId" CHAR(36) NOT NULL,
            "environmentTargetId" DOUBLE PRECISION,
            "clusterId" DOUBLE PRECISION NOT NULL,
            "clusterName" VARCHAR(255) NOT NULL,
            "helmType" "apps_environments_helmType" NOT NULL,
            "helmNamespace" VARCHAR(255) NOT NULL,
            "helmName" VARCHAR(255) NOT NULL,
            "status" "apps_deployment_targets_status" NOT NULL DEFAULT 'pending',
            "statusMessage" VARCHAR(255),
            "completedAt" TIMESTAMP,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`CREATE INDEX "idx_apps_deployment_targets_deploymentId" ON "apps_deployment_targets" ("deploymentId")`);
});
