export interface CIEnvironment {
    repoUrl: string;
    jobId: string;
    jobToken: string;
}

export function detectCIEnvironment(): CIEnvironment {
    // GitLab CI
    if (process.env.GITLAB_CI) {
        const repoUrl = process.env.CI_PROJECT_URL;
        const jobId = process.env.CI_JOB_ID;
        const jobToken = process.env.CI_JOB_TOKEN;

        if (!repoUrl || !jobId || !jobToken) {
            throw new Error('GitLab CI detected but missing required env vars: CI_PROJECT_URL, CI_JOB_ID, CI_JOB_TOKEN');
        }

        return { repoUrl, jobId, jobToken };
    }

    // GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
        const serverUrl = process.env.GITHUB_SERVER_URL;
        const repository = process.env.GITHUB_REPOSITORY;
        const jobId = process.env.GITHUB_RUN_ID;
        const jobToken = process.env.GITHUB_TOKEN || process.env.ACTIONS_RUNTIME_TOKEN;

        if (!serverUrl || !repository || !jobId || !jobToken) {
            throw new Error(
                'GitHub Actions detected but missing required env vars: GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_TOKEN'
            );
        }

        return {
            repoUrl: `${serverUrl}/${repository}`,
            jobId,
            jobToken
        };
    }

    throw new Error('Could not detect CI environment. Set environment variables manually or use --repo, --job-id, --job-token flags.');
}
