import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { DeploymentStatus, DeploymentStatusEvent } from '@zyno-io/dag-shared';

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

    error(message: string): void {
        this.spinner.fail(chalk.red(message));
    }
}
