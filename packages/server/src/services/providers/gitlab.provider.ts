import type { IGitProvider } from './git-provider.interface';
import { JobTokenVerificationError } from '../../errors';

export class GitLabProvider implements IGitProvider {
    async verifyJobAndGetBranch(repoUrl: string, jobId: string, jobToken: string): Promise<string> {
        // Extract GitLab host from repoUrl
        const url = new URL(repoUrl);
        const gitlabApiUrl = `${url.protocol}//${url.host}/api/v4/job`;

        const response = await fetch(gitlabApiUrl, {
            headers: {
                'JOB-TOKEN': jobToken
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new JobTokenVerificationError();
            }
            throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
        }

        const job = (await response.json()) as {
            id: number;
            ref: string;
            web_url: string;
            pipeline: { project_id: number };
        };

        // Verify the job ID matches
        if (String(job.id) !== String(jobId)) {
            throw new JobTokenVerificationError(`Job ID mismatch: expected ${jobId}, got ${job.id}`);
        }

        // Verify the job belongs to the expected repository by extracting
        // the project path from web_url (e.g. https://host/group/project/-/jobs/123)
        const jobUrl = new URL(job.web_url);
        const projectPath = jobUrl.pathname.replace(/\/-\/jobs\/\d+$/, '').replace(/^\//, '');
        const expectedPath = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
        if (projectPath !== expectedPath) {
            throw new JobTokenVerificationError(`Job belongs to project "${projectPath}", expected "${expectedPath}"`);
        }

        return job.ref;
    }
}
