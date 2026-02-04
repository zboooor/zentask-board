/**
 * Crypto utilities for encrypting/decrypting content
 * Uses Web Crypto API with AES-GCM for secure encryption
 */

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
}

// Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Derive encryption key from password using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const passwordBuffer = stringToArrayBuffer(password);

    // Import password as raw key
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer.buffer as ArrayBuffer,
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derive AES-GCM key using PBKDF2
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: 100000,
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Generate a random salt for password verification
export function generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return arrayBufferToBase64(salt.buffer);
}

// Generate verification hash for password
export async function generatePasswordHash(password: string, salt: string): Promise<string> {
    const saltBuffer = base64ToArrayBuffer(salt);
    const passwordBuffer = stringToArrayBuffer(password);

    // Combine salt and password
    const combined = new Uint8Array(saltBuffer.byteLength + passwordBuffer.byteLength);
    combined.set(new Uint8Array(saltBuffer), 0);
    combined.set(new Uint8Array(passwordBuffer), saltBuffer.byteLength);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    return arrayBufferToBase64(hashBuffer);
}

// Encrypt text with password
export async function encrypt(text: string, password: string): Promise<string> {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key from password
    const key = await deriveKey(password, salt);

    // Encrypt the text
    const textBuffer = stringToArrayBuffer(text);
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        textBuffer.buffer as ArrayBuffer
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    // Return as Base64
    return arrayBufferToBase64(combined.buffer);
}

// Decrypt ciphertext with password
export async function decrypt(ciphertext: string, password: string): Promise<string> {
    try {
        // Decode Base64
        const combined = new Uint8Array(base64ToArrayBuffer(ciphertext));

        // Extract salt, iv, and encrypted data
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encryptedData = combined.slice(28);

        // Derive key from password
        const key = await deriveKey(password, salt);

        // Decrypt
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            key,
            encryptedData.buffer as ArrayBuffer
        );

        return arrayBufferToString(decryptedBuffer);
    } catch (error) {
        throw new Error('Decryption failed - incorrect password');
    }
}

// Verify if password is correct using stored salt
export async function verifyPassword(
    storedHash: string,
    salt: string,
    password: string
): Promise<boolean> {
    const computedHash = await generatePasswordHash(password, salt);
    return computedHash === storedHash;
}

// Encryption marker prefix to identify encrypted content
export const ENCRYPTED_PREFIX = 'ENC:';

// Check if content is encrypted
export function isEncryptedContent(content: string): boolean {
    return content.startsWith(ENCRYPTED_PREFIX);
}

// Encrypt content with marker
export async function encryptContent(content: string, password: string): Promise<string> {
    const encrypted = await encrypt(content, password);
    return ENCRYPTED_PREFIX + encrypted;
}

// Decrypt content with marker
export async function decryptContent(content: string, password: string): Promise<string> {
    if (!isEncryptedContent(content)) {
        return content; // Not encrypted, return as-is
    }
    const ciphertext = content.slice(ENCRYPTED_PREFIX.length);
    return decrypt(ciphertext, password);
}
