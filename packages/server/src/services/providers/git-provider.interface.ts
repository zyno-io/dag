export interface IGitProvider {
    verifyJobAndGetBranch(repoUrl: string, jobId: string, jobToken: string): Promise<string>;
}
