import type { DeploymentStatus, DeploymentStatusEvent, DeploymentTargetStatusEvent } from '@zyno-io/dag-shared';

import chalk from 'chalk';
import ora, { Ora } from 'ora';

const STATUS_COLORS: Record<DeploymentStatus, (text: string) => string> = {
    pending: chalk.gray,
    validating: chalk.cyan,
    pushing: chalk.yellow,
    pushed: chalk.yellow,
    monitoring: chalk.blue,
    deployed: chalk.green,
    failed: chalk.red
};

export class DeploymentDisplay {
    private spinner: Ora;
    private isTTY: boolean;
    private lastMessage: string = '';
    private commitUrl: string | undefined;

    constructor() {
        this.isTTY = !!process.stderr.isTTY;
        this.spinner = ora({ text: 'Starting deployment...', color: 'cyan' });
    }

    start(): void {
        this.spinner.start();
    }

    update(event: DeploymentStatusEvent): void {
        const colorFn = STATUS_COLORS[event.status] ?? chalk.white;

        if (event.commitUrl && !this.commitUrl) {
            this.commitUrl = event.commitUrl;
            this.spinner.info(`IaC commit: ${event.commitUrl}`);
            this.spinner = ora({ color: 'cyan' });
            this.spinner.start();
        } else if (event.commitUrl) {
            this.commitUrl = event.commitUrl;
        }

        if (event.status === 'deployed') {
            this.spinner.succeed(colorFn(event.message));
        } else if (event.status === 'failed') {
            this.spinner.fail(colorFn(event.message));
        } else {
            const text = `[${event.status}] ${event.message}`;
            this.spinner.text = colorFn(text);

            // In non-TTY (CI), ora swallows text updates. Log status changes as lines.
            if (!this.isTTY && event.message !== this.lastMessage) {
                console.error(colorFn(`  ${text}`));
            }
            this.lastMessage = event.message;
        }
    }

    /** Per-target events never complete the overall spinner; only the parent aggregate does. */
    updateTarget(event: DeploymentTargetStatusEvent): void {
        const { clusterName, status, message } = event.target;
        const colorFn = status === 'deployed' ? chalk.green : status === 'failed' ? chalk.red : chalk.blue;
        const text = `[${clusterName}] [${status}] ${message}`;

        if (this.isTTY) {
            this.spinner.text = colorFn(text);
        } else if (text !== this.lastMessage) {
            console.error(colorFn(`  ${text}`));
        }
        this.lastMessage = text;
    }

    error(message: string): void {
        this.spinner.fail(chalk.red(message));
    }
}
