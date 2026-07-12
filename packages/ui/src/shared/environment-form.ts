export interface EnvironmentForm {
    name: string;
    branch: string;
    iacId: number;
    iacPath: string;
    iacBranch: string | null;
    clusterId: number;
    helmType: 'flux' | 'plain';
    helmNamespace: string | null;
    helmName: string | null;
}

export function blankEnvironment(): EnvironmentForm {
    return {
        name: '',
        branch: '',
        // 0 is never a valid id, so `required` on the select rejects the unset state.
        iacId: 0,
        iacPath: '',
        iacBranch: null,
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
        clusterId: environment.clusterId,
        helmType: environment.helmType,
        helmNamespace: environment.helmNamespace,
        helmName: environment.helmName
    };
}
