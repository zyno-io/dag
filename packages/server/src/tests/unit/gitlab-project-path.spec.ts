import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gitlabProjectPath } from '../../services/gitlab.service';

/**
 * This is what anchors the whole permission model: source and IaC rights come from GitLab,
 * which we can only ask about if we can turn a repo URL into a project path. Returning null
 * here means "deny everyone", so it must not be lenient.
 */
describe('gitlabProjectPath', () => {
    const gitlab = 'https://gitlab.example.com';

    it('derives a project path from a repo URL', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com/org/iac-repo', gitlab), 'org/iac-repo');
    });

    it('strips a .git suffix and trailing slashes', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com/org/iac-repo.git', gitlab), 'org/iac-repo');
        assert.equal(gitlabProjectPath('https://gitlab.example.com/org/iac-repo/', gitlab), 'org/iac-repo');
    });

    it('handles subgroups', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com/org/team/iac-repo.git', gitlab), 'org/team/iac-repo');
    });

    it('tolerates a trailing slash on the configured GitLab URL', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com/org/iac-repo', 'https://gitlab.example.com/'), 'org/iac-repo');
    });

    it('refuses a repo on a different host, rather than guessing a path', () => {
        assert.equal(gitlabProjectPath('https://gitlab.com/org/iac-repo', gitlab), null);
        assert.equal(gitlabProjectPath('https://github.com/org/iac-repo', gitlab), null);
    });

    it('refuses a host that merely starts with the GitLab URL', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com.evil.test/org/iac-repo', gitlab), null);
    });

    it('refuses an ssh remote, which carries no usable path for the API', () => {
        assert.equal(gitlabProjectPath('git@gitlab.example.com:org/iac-repo.git', gitlab), null);
    });

    it('refuses the bare GitLab URL', () => {
        assert.equal(gitlabProjectPath('https://gitlab.example.com', gitlab), null);
        assert.equal(gitlabProjectPath('https://gitlab.example.com/', gitlab), null);
    });
});
