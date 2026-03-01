import { Crypto, BaseEntity } from '@zyno-io/dk-server-foundation';

const ENCRYPTED_PREFIX = 'enc:';

export function encryptValue(plaintext: string): string {
    return ENCRYPTED_PREFIX + Crypto.encrypt(plaintext);
}

/**
 * Decrypt a field value from an entity. If the value is not prefixed
 * with the encryption marker (e.g. manually inserted via SQL),
 * encrypt it in place and save.
 */
export async function decryptField<T extends BaseEntity>(entity: T, field: keyof T & string): Promise<string> {
    const value = entity[field] as string;
    if (value.startsWith(ENCRYPTED_PREFIX)) {
        return Crypto.decrypt(value.slice(ENCRYPTED_PREFIX.length));
    }

    // Value is plaintext — encrypt in place and persist
    (entity[field] as unknown) = encryptValue(value);
    await entity.save();
    return value;
}
