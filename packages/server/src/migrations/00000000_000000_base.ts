import { createMigration } from '@zyno-io/dk-server-foundation';

export default createMigration(async db => {
    await db.rawExecute(`
        CREATE TABLE "apps" (
            "id" SERIAL,
            "gitProvider" JSONB NOT NULL,
            "repoUrl" VARCHAR(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL,
            "updatedAt" TIMESTAMP NOT NULL,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`
        CREATE TABLE "apps_environments" (
            "id" SERIAL,
            "appId" DOUBLE PRECISION NOT NULL,
            "branch" VARCHAR(255) NOT NULL,
            "iacId" DOUBLE PRECISION NOT NULL,
            "iacPath" VARCHAR(255) NOT NULL,
            "clusterId" DOUBLE PRECISION NOT NULL,
            "helmType" JSONB NOT NULL,
            "helmNamespace" VARCHAR(255),
            "helmName" VARCHAR(255),
            "iacBranch" VARCHAR(255),
            "createdAt" TIMESTAMP NOT NULL,
            "updatedAt" TIMESTAMP NOT NULL,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`
        CREATE TABLE "clusters" (
            "id" SERIAL,
            "name" VARCHAR(255) NOT NULL,
            "apiUrl" VARCHAR(255) NOT NULL,
            "serviceAccountToken" VARCHAR(255) NOT NULL,
            "caCert" VARCHAR(255),
            "createdAt" TIMESTAMP NOT NULL,
            "updatedAt" TIMESTAMP NOT NULL,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`
        CREATE TABLE "deployments" (
            "id" CHAR(36) NOT NULL,
            "appEnvironmentId" DOUBLE PRECISION NOT NULL,
            "ciJobId" VARCHAR(255) NOT NULL,
            "commitSha" VARCHAR(255),
            "version" VARCHAR(255) NOT NULL,
            "status" JSONB NOT NULL,
            "statusMessage" VARCHAR(255),
            "createdAt" TIMESTAMP NOT NULL,
            "updatedAt" TIMESTAMP NOT NULL,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`
        CREATE TABLE "iacs" (
            "id" SERIAL,
            "name" VARCHAR(255) NOT NULL,
            "repoUrl" VARCHAR(255) NOT NULL,
            "accessToken" VARCHAR(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL,
            "updatedAt" TIMESTAMP NOT NULL,
            PRIMARY KEY ("id")
        )
    `);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_apps_repo_url_unique" ON "apps"("repoUrl")`);
    await db.rawExecute(`CREATE UNIQUE INDEX "idx_apps_environments_app_branch_unique" ON "apps_environments"("appId", "branch")`);
});
