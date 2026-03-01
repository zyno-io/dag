import { createMigration } from '@zyno-io/dk-server-foundation';

export default createMigration(async db => {
    // Table: apps
    await db.rawExecute(`
        DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apps_gitProvider') THEN
            CREATE TYPE "apps_gitProvider" AS ENUM ('gitlab', 'github');
        END IF;
        END \$\$
    `);
    await db.rawExecute(`CREATE CAST (text AS "apps_gitProvider") WITH INOUT AS IMPLICIT`);
    await db.rawExecute(`
        CREATE TABLE "apps" (
            "id" SERIAL,
            "gitProvider" "apps_gitProvider" NOT NULL,
            "repoUrl" VARCHAR(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_apps_repoUrl" ON "apps" ("repoUrl")`);

    // Table: apps_environments
    await db.rawExecute(`
        DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apps_environments_helmType') THEN
            CREATE TYPE "apps_environments_helmType" AS ENUM ('flux', 'plain');
        END IF;
        END \$\$
    `);
    await db.rawExecute(`CREATE CAST (text AS "apps_environments_helmType") WITH INOUT AS IMPLICIT`);
    await db.rawExecute(`
        CREATE TABLE "apps_environments" (
            "id" SERIAL,
            "appId" DOUBLE PRECISION NOT NULL,
            "branch" VARCHAR(255) NOT NULL,
            "iacId" DOUBLE PRECISION NOT NULL,
            "iacPath" VARCHAR(255) NOT NULL,
            "clusterId" DOUBLE PRECISION NOT NULL,
            "helmType" "apps_environments_helmType" NOT NULL,
            "helmNamespace" VARCHAR(255),
            "helmName" VARCHAR(255),
            "iacBranch" VARCHAR(255),
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_apps_environments_appId_branch" ON "apps_environments" ("appId", "branch")`);

    // Table: clusters
    await db.rawExecute(`
        CREATE TABLE "clusters" (
            "id" SERIAL,
            "name" VARCHAR(255) NOT NULL,
            "apiUrl" VARCHAR(255) NOT NULL,
            "serviceAccountToken" TEXT NOT NULL,
            "caCert" TEXT,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);

    // Table: apps_deployments
    await db.rawExecute(`
        DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apps_deployments_status') THEN
            CREATE TYPE "apps_deployments_status" AS ENUM ('pending', 'validating', 'pushing', 'pushed', 'monitoring', 'deployed', 'failed');
        END IF;
        END \$\$
    `);
    await db.rawExecute(`CREATE CAST (text AS "apps_deployments_status") WITH INOUT AS IMPLICIT`);
    await db.rawExecute(`
        CREATE TABLE "apps_deployments" (
            "id" CHAR(36) NOT NULL,
            "appEnvironmentId" DOUBLE PRECISION NOT NULL,
            "ciJobId" VARCHAR(255) NOT NULL,
            "commitSha" VARCHAR(255),
            "version" VARCHAR(255) NOT NULL,
            "status" "apps_deployments_status" NOT NULL DEFAULT 'pending',
            "statusMessage" VARCHAR(255),
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);

    // Table: iacs
    await db.rawExecute(`
        CREATE TABLE "iacs" (
            "id" SERIAL,
            "name" VARCHAR(255) NOT NULL,
            "repoUrl" VARCHAR(255) NOT NULL,
            "accessToken" VARCHAR(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("id")
        )
    `);
});
