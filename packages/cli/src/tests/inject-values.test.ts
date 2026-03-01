import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { setNestedValue } from '../yaml-utils.js';

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
