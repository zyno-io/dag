import { createMigration } from '@zyno-io/ts-server-foundation';

export default createMigration(async db => {
    // An IaC chart path is a write target, so sharing it would let separate deployments
    // overwrite one another. These indexes deliberately omit appId: targets are global.
    await db.rawExecute(`
        CREATE UNIQUE INDEX "idx_apps_environments_iacId_iacPath"
        ON "apps_environments" ("iacId", "iacPath")
    `);

    // Helm defaults an omitted namespace to "default" and an omitted release name to the
    // chart directory's basename. Index the effective target so implicit and explicit defaults
    // cannot be used to bypass the same-release guard.
    await db.rawExecute(`
        CREATE UNIQUE INDEX "idx_apps_environments_helm_target"
        ON "apps_environments" (
            "clusterId",
            "helmType",
            COALESCE("helmNamespace", 'default'),
            COALESCE("helmName", regexp_replace("iacPath", '^.*/', ''))
        )
    `);
});
