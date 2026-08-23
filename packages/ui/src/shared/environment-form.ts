export interface EnvironmentTargetForm {
    clusterId: number;
    helmType: 'flux' | 'plain';
    helmNamespace: string | null;
    helmName: string | null;
}

export interface EnvironmentForm {
    name: string;
    branch: string;
    iacId: number;
    iacPath: string;
    iacBranch: string | null;
    targets: EnvironmentTargetForm[];
}

export function blankEnvironment(): EnvironmentForm {
    return {
        name: '',
        branch: '',
        // 0 is never a valid id, so `required` on the select rejects the unset state.
        iacId: 0,
        iacPath: '',
        iacBranch: null,
        targets: [blankEnvironmentTarget()]
    };
}

export function blankEnvironmentTarget(): EnvironmentTargetForm {
    return {
        clusterId: 0,
        helmType: 'flux',
        helmNamespace: null,
        helmName: null
    };
}

export function toEnvironmentForm(environment: EnvironmentForm): EnvironmentForm {
    return {
        name: environment.name,
        branch: environment.branch,
        iacId: environment.iacId,
        iacPath: environment.iacPath,
        iacBranch: environment.iacBranch,
        targets: environment.targets.map(target => ({
            clusterId: target.clusterId,
            helmType: target.helmType,
            helmNamespace: target.helmNamespace,
            helmName: target.helmName
        }))
    };
}
