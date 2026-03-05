import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { setNestedValue, deepMerge } from '../yaml-utils.js';

describe('setNestedValue', () => {
    it('should set a top-level key', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'foo', 'bar');
        assert.deepEqual(obj, { foo: 'bar' });
    });

    it('should set a nested key', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'a.b.c', 'value');
        assert.deepEqual(obj, { a: { b: { c: 'value' } } });
    });

    it('should overwrite an existing value', () => {
        const obj: Record<string, any> = { a: { b: 'old' } };
        setNestedValue(obj, 'a.b', 'new');
        assert.deepEqual(obj, { a: { b: 'new' } });
    });

    it('should create intermediate objects when path has non-object value', () => {
        const obj: Record<string, any> = { a: 'scalar' };
        setNestedValue(obj, 'a.b', 'value');
        assert.deepEqual(obj, { a: { b: 'value' } });
    });

    it('should handle null intermediate values', () => {
        const obj: Record<string, any> = { a: null };
        setNestedValue(obj, 'a.b', 'value');
        assert.deepEqual(obj, { a: { b: 'value' } });
    });

    it('should preserve existing sibling keys', () => {
        const obj: Record<string, any> = { a: { x: 1 } };
        setNestedValue(obj, 'a.y', 2);
        assert.deepEqual(obj, { a: { x: 1, y: 2 } });
    });
});

describe('setNestedValue with typed values (--set-json patterns)', () => {
    it('should set a numeric value', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'replicas', 3);
        assert.deepEqual(obj, { replicas: 3 });
        assert.strictEqual(typeof obj.replicas, 'number');
    });

    it('should set a boolean value', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'enabled', true);
        assert.deepEqual(obj, { enabled: true });
        assert.strictEqual(typeof obj.enabled, 'boolean');
    });

    it('should set an object value', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'resources', { limits: { cpu: '500m', memory: '256Mi' } });
        assert.deepEqual(obj, { resources: { limits: { cpu: '500m', memory: '256Mi' } } });
    });

    it('should set an array value', () => {
        const obj: Record<string, any> = {};
        setNestedValue(obj, 'args', ['--verbose', '--debug']);
        assert.deepEqual(obj, { args: ['--verbose', '--debug'] });
        assert.ok(Array.isArray(obj.args));
    });

    it('should set null value', () => {
        const obj: Record<string, any> = { a: 'something' };
        setNestedValue(obj, 'a', null);
        assert.deepEqual(obj, { a: null });
    });
});

describe('deepMerge', () => {
    it('should merge top-level keys', () => {
        const base = { a: 1 };
        const overlay = { b: 2 };
        assert.deepEqual(deepMerge(base, overlay), { a: 1, b: 2 });
    });

    it('should override scalar values', () => {
        const base = { a: 1 };
        const overlay = { a: 2 };
        assert.deepEqual(deepMerge(base, overlay), { a: 2 });
    });

    it('should recursively merge nested objects', () => {
        const base = { a: { b: 1, c: 2 } };
        const overlay = { a: { c: 3, d: 4 } };
        assert.deepEqual(deepMerge(base, overlay), { a: { b: 1, c: 3, d: 4 } });
    });

    it('should replace arrays from overlay', () => {
        const base = { a: [1, 2] };
        const overlay = { a: [3, 4, 5] };
        assert.deepEqual(deepMerge(base, overlay), { a: [3, 4, 5] });
    });

    it('should replace scalar with object from overlay', () => {
        const base = { a: 'scalar' } as Record<string, unknown>;
        const overlay = { a: { nested: true } };
        assert.deepEqual(deepMerge(base, overlay), { a: { nested: true } });
    });

    it('should replace object with scalar from overlay', () => {
        const base = { a: { nested: true } } as Record<string, unknown>;
        const overlay = { a: 'scalar' } as Record<string, unknown>;
        assert.deepEqual(deepMerge(base, overlay), { a: 'scalar' });
    });

    it('should throw on forbidden keys', () => {
        const base = {};
        const overlay = Object.create(null);
        overlay['__proto__'] = { polluted: true };
        assert.throws(() => deepMerge(base, overlay), /Forbidden key/);
    });
});
