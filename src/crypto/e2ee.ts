import type { BufferSource } from 'bun';
import { validateRoomId } from '@errors';
import type { EncryptedEnvelope } from '@types';

const ROOM_ID_BYTES = 16;
const ROOM_KEY_BYTES = 16;
const IV_BYTES = 12;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export const E2EE_ENVELOPE_VERSION = 1;
export const E2EE_ALGORITHM = "A128GCM";


function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (val) => val.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("QXChat E2EE Error: Invalid hex payload.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return base64ToBytes(padded);
}

/**
 * Normalizes a hex E2EE room key. Checks size constraints.
 * 
 * @param {string} val Raw hex or text key string.
 * @returns {string} Standardized 32-character hex key string.
 * @throws {Error} If key bytes count is not exactly 16.
 */
export function normalizeRoomKey(val: string): string {
  const bytes = hexToBytes(String(val || "").trim());
  if (bytes.length !== ROOM_KEY_BYTES) throw new Error("QXChat: Invalid room key length.");
  return bytesToHex(bytes);
}

/**
 * Generates a brand new random E2EE key for a room.
 * 
 * @returns {string} 32-character hex E2EE key.
 */
export function generateRoomKey(): string {
  const bytes = new Uint8Array(ROOM_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Normalizes a 64-character invite token.
 * 
 * @param {string} val Raw room access token code.
 * @returns {string} Normalized 64-char hex string.
 * @throws {Error} If the format is not exactly 64 hex characters.
 */
export function normalizeRoomAccessToken(val: string): string {
  const norm = String(val || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(norm)) throw new Error("QXChat: Invalid room token format.");
  return norm;
}

/**
 * Generates a random room ID and key, merging them into an invite token.
 * 
 * @returns {{ roomId: string; roomKey: string; token: string }} Token payload.
 */
export function generateRoomAccessToken(): { roomId: string; roomKey: string; token: string } {
  const roomIdBytes = new Uint8Array(ROOM_ID_BYTES);
  const roomKeyBytes = new Uint8Array(ROOM_KEY_BYTES);
  crypto.getRandomValues(roomIdBytes);
  crypto.getRandomValues(roomKeyBytes);
  const roomId = bytesToHex(roomIdBytes);
  const roomKey = bytesToHex(roomKeyBytes);
  return {
    roomId,
    roomKey,
    token: `${roomId}${roomKey}`
  };
}

/**
 * Splits a 64-character room access token into roomId and roomKey.
 * 
 * @param {string} rawValue 64-character invite token.
 * @returns {{ token: string; roomId: string; roomKey: string }} Split token components.
 * @throws {Error} If format validation fails.
 */
export function parseRoomAccessToken(rawValue: string): { token: string; roomId: string; roomKey: string } {
  const token = normalizeRoomAccessToken(rawValue);
  return {
    token,
    roomId: token.slice(0, ROOM_ID_BYTES * 2),
    roomKey: token.slice(ROOM_ID_BYTES * 2)
  };
}

/**
 * Imports a hex room key into a webcrypto CryptoKey instance.
 * 
 * @param {string} roomKey Hex-encoded room key.
 * @returns {Promise<CryptoKey>} Webcrypto AES-GCM key instance.
 * @throws {Error} If the key size is invalid.
 */
async function importRoomKey(roomKey: string): Promise<CryptoKey> {
  const raw = hexToBytes(roomKey);
  if (raw.length !== ROOM_KEY_BYTES) throw new Error("QXChat: Invalid room key length.");
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Checks if a value conforms to the EncryptedEnvelope interface.
 * 
 * @param {unknown} value Candidate to check.
 * @returns {value is EncryptedEnvelope} True if it matches structure.
 */
export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return Boolean(
    value
    && typeof value === "object"
    && 'v' in value
    && 'alg' in value
    && 'iv' in value
    && 'ciphertext' in value
    && Number((value as Record<string, unknown>).v) === E2EE_ENVELOPE_VERSION
    && String((value as Record<string, unknown>).alg || "") === E2EE_ALGORITHM
    && typeof (value as Record<string, unknown>).iv === "string"
    && typeof (value as Record<string, unknown>).ciphertext === "string"
  );
}

/**
 * Encrypts a room payload using AES-GCM with roomId as AAD.
 * 
 * @param {string} roomKey Hex representation of E2EE key.
 * @param {string} roomId Associated room identifier.
 * @param {unknown} payload Data object to encrypt.
 * @returns {Promise<EncryptedEnvelope>} Encrypted structure.
 * @throws {Error} If parameter limits are violated or encryption fails.
 */
export async function encryptRoomPayload(
  roomKey: string,
  roomId: string,
  payload: unknown
): Promise<EncryptedEnvelope> {
  const validatedRoomId = validateRoomId(roomId);
  const key = await importRoomKey(roomKey);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  const aad = TEXT_ENCODER.encode(String(validatedRoomId));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
    key,
    plaintext.buffer as ArrayBuffer
  );
  return {
    v: E2EE_ENVELOPE_VERSION,
    alg: E2EE_ALGORITHM,
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext))
  };
}

/**
 * Decrypts a room envelope using AES-GCM and verifies authenticity with roomId.
 * 
 * @param {string} roomKey Hex representation of E2EE key.
 * @param {string} roomId Associated room identifier.
 * @param {unknown} envelope Encrypted payload envelope.
 * @returns {Promise<unknown>} Plaintext JSON payload data.
 * @throws {Error} If structure is invalid or decryption fails.
 */
export async function decryptRoomPayload(
  roomKey: string,
  roomId: string,
  envelope: unknown
): Promise<unknown> {
  const cleanId = validateRoomId(roomId);
  if (!isEncryptedEnvelope(envelope)) throw new Error("QXChat: Invalid encrypted envelope structure.");
  const key = await importRoomKey(roomKey);
  const iv = decodeBase64Url(envelope.iv);
  const ciphertext = decodeBase64Url(envelope.ciphertext);
  const aad = TEXT_ENCODER.encode(String(cleanId));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  return JSON.parse(TEXT_DECODER.decode(plaintext));
}
