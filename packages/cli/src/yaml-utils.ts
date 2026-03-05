const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(overlay)) {
        if (FORBIDDEN_KEYS.has(key)) {
            throw new Error(`Forbidden key in merge: ${key}`);
        }
        const baseVal = base[key];
        const overlayVal = overlay[key];
        if (
            baseVal !== null &&
            baseVal !== undefined &&
            typeof baseVal === 'object' &&
            !Array.isArray(baseVal) &&
            overlayVal !== null &&
            overlayVal !== undefined &&
            typeof overlayVal === 'object' &&
            !Array.isArray(overlayVal)
        ) {
            base[key] = deepMerge(baseVal as Record<string, unknown>, overlayVal as Record<string, unknown>);
        } else {
            base[key] = overlayVal;
        }
    }
    return base;
}

export function setNestedValue(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
    const keys = dottedPath.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (FORBIDDEN_KEYS.has(key)) {
            throw new Error(`Forbidden key in path: ${key}`);
        }
        if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }

    const finalKey = keys[keys.length - 1];
    if (FORBIDDEN_KEYS.has(finalKey)) {
        throw new Error(`Forbidden key in path: ${finalKey}`);
    }
    current[finalKey] = value;
}
