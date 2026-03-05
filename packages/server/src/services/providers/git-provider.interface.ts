export interface JobVerificationResult {
    branch: string;
    commitSha: string;
}

export interface IGitProvider {
    verifyJobAndGetBranch(repoUrl: string, jobId: string, jobToken: string): Promise<JobVerificationResult>;
}
