import type { GitProvider } from '@zyno-io/dag-shared';
import type { IGitProvider } from './providers/git-provider.interface';
import { GitLabProvider } from './providers/gitlab.provider';
import { GitHubProvider } from './providers/github.provider';

export class GitProviderService {
    private providers: Record<GitProvider, IGitProvider> = {
        gitlab: new GitLabProvider(),
        github: new GitHubProvider()
    };

    getProvider(provider: GitProvider): IGitProvider {
        const impl = this.providers[provider];
        if (!impl) {
            throw new Error(`Unknown git provider: ${provider}`);
        }
        return impl;
    }

    async verifyJobAndGetBranch(provider: GitProvider, repoUrl: string, jobId: string, jobToken: string): Promise<string> {
        return this.getProvider(provider).verifyJobAndGetBranch(repoUrl, jobId, jobToken);
    }
}
