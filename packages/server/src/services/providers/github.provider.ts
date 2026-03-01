import type { IGitProvider } from './git-provider.interface';

export class GitHubProvider implements IGitProvider {
    async verifyJobAndGetBranch(_repoUrl: string, _jobId: string, _jobToken: string): Promise<string> {
        throw new Error('GitHub provider is not yet implemented');
    }
}
