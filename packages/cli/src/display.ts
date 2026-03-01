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

    constructor() {
        this.spinner = ora({ text: 'Starting deployment...', color: 'cyan' });
    }

    start(): void {
        this.spinner.start();
    }

    update(event: DeploymentStatusEvent): void {
        const colorFn = STATUS_COLORS[event.status] ?? chalk.white;

        if (event.status === 'deployed') {
            this.spinner.succeed(colorFn(event.message));
        } else if (event.status === 'failed') {
            this.spinner.fail(colorFn(event.message));
        } else {
            this.spinner.text = colorFn(`[${event.status}] ${event.message}`);
        }
    }

    error(message: string): void {
        this.spinner.fail(chalk.red(message));
    }
}
