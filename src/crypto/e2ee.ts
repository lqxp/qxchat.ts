import { validateRoomId, type RoomId } from '@errors';
import type { EncryptedEnvelope, JsonWebKey } from '@types';

const ROOM_ID_BYTES = 16;
const ROOM_KEY_BYTES = 32;
const IV_BYTES = 12;
const MESSAGE_SALT_BYTES = 32;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export const E2EE_ENVELOPE_VERSION = 2;
export const E2EE_ALGORITHM = "QXDR-A256GCM-HKDFSHA256";

const hexCache = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function bytesToHex(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      text += hexCache[b] || "";
    }
  }
  return text;
}

const hexValues: Record<string, number> = {};
for (let i = 0; i < 16; i++) {
  hexValues[i.toString(16)] = i;
}

function hexToBytes(value: string): Uint8Array {
  const norm = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(norm) || norm.length % 2 !== 0) {
    throw new Error("QXChat E2EE Error: Invalid hex payload.");
  }
  const bytes = new Uint8Array(norm.length / 2);
  for (let i = 0; i < norm.length; i += 2) {
    const c1 = norm[i];
    const c2 = norm[i + 1];
    if (c1 !== undefined && c2 !== undefined) {
      const high = hexValues[c1]!;
      const low = hexValues[c2]!;
      bytes[i / 2] = (high << 4) | low;
    }
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

function strictBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer as ArrayBuffer;
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
 * @param {string} val Raw hex key string.
 * @returns {string} Standardized 64-character hex key string.
 * @throws {Error} If key bytes count is not exactly 32.
 */
export function normalizeRoomKey(val: string): string {
  const bytes = hexToBytes(String(val || "").trim());
  if (bytes.length !== ROOM_KEY_BYTES) throw new Error("QXChat: Invalid room key length.");
  return bytesToHex(bytes);
}

/**
 * Generates a brand new random 32-byte E2EE key for a room.
 * 
 * @returns {string} 64-character hex E2EE key.
 */
export function generateRoomKey(): string {
  const bytes = new Uint8Array(ROOM_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Normalizes a 96-character invite token.
 * 
 * @param {string} val Raw room access token code.
 * @returns {string} Normalized 96-char hex string.
 * @throws {Error} If the format is not exactly 96 hex characters.
 */
export function normalizeRoomAccessToken(val: string): string {
  const norm = String(val || "").trim().toLowerCase();
  if (!/^[0-9a-f]{96}$/.test(norm)) throw new Error("QXChat: Invalid room token format.");
  return norm;
}

/**
 * Generates a random room ID and key, merging them into a 96-character invite token.
 * 
 * @returns {{ roomId: RoomId; roomKey: string; token: string }} Token payload.
 */
export function generateRoomAccessToken(): { roomId: RoomId; roomKey: string; token: string } {
  const roomIdBytes = new Uint8Array(ROOM_ID_BYTES);
  const roomKeyBytes = new Uint8Array(ROOM_KEY_BYTES);
  crypto.getRandomValues(roomIdBytes);
  crypto.getRandomValues(roomKeyBytes);
  const roomId = bytesToHex(roomIdBytes) as RoomId;
  const roomKey = bytesToHex(roomKeyBytes);
  return {
    roomId,
    roomKey,
    token: `${roomId}${roomKey}`
  };
}

/**
 * Splits a 96-character room access token into roomId (32 chars) and roomKey (64 chars).
 * 
 * @param {string} rawValue 96-character invite token.
 * @returns {{ token: string; roomId: RoomId; roomKey: string }} Split token components.
 * @throws {Error} If format validation fails.
 */
export function parseRoomAccessToken(rawValue: string): { token: string; roomId: RoomId; roomKey: string } {
  const token = normalizeRoomAccessToken(rawValue);
  return {
    token,
    roomId: token.slice(0, ROOM_ID_BYTES * 2) as RoomId,
    roomKey: token.slice(ROOM_ID_BYTES * 2)
  };
}

const hkdfKeysCache = new Map<string, CryptoKey>();

async function deriveMessageKey(roomKey: string, roomId: string, salt: Uint8Array, counter: number): Promise<CryptoKey> {
  let baseKey = hkdfKeysCache.get(roomKey);
  if (!baseKey) {
    const raw = hexToBytes(roomKey);
    if (raw.length !== ROOM_KEY_BYTES) throw new Error("QXChat: Invalid room key length.");
    baseKey = await crypto.subtle.importKey(
      "raw",
      strictBuffer(raw),
      "HKDF",
      false,
      ["deriveKey"]
    );
    hkdfKeysCache.set(roomKey, baseKey);
  }
  const info = TEXT_ENCODER.encode(`qxchat:e2ee:v2:${roomId}:${counter}`);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: strictBuffer(salt), info: strictBuffer(info) },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importDevicePublicKey(publicKey: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

function signingPayload(envelope: EncryptedEnvelope): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify({
    v: envelope.v,
    alg: envelope.alg,
    roomId: envelope.roomId,
    n: envelope.n,
    salt: envelope.salt,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    senderDeviceId: envelope.senderDeviceId,
    senderSigningKey: envelope.senderSigningKey
  }));
}

let activeSigner: {
  deviceId: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  privateCryptoKey: CryptoKey;
  publicCryptoKey: CryptoKey;
} | null = null;

async function getSigner() {
  if (!activeSigner) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const deviceId = bytesToHex(bytes);

    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    activeSigner = {
      deviceId,
      publicKey: publicKey as JsonWebKey,
      privateKey: privateKey as JsonWebKey,
      privateCryptoKey: keyPair.privateKey,
      publicCryptoKey: keyPair.publicKey,
    };
  }
  return activeSigner!;
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
    && 'salt' in value
    && 'n' in value
    && 'ciphertext' in value
    && 'senderDeviceId' in value
    && 'senderSigningKey' in value
    && 'signature' in value
    && Number((value as Record<string, unknown>).v) === E2EE_ENVELOPE_VERSION
    && String((value as Record<string, unknown>).alg || "") === E2EE_ALGORITHM
    && typeof (value as Record<string, unknown>).iv === "string"
    && typeof (value as Record<string, unknown>).salt === "string"
    && Number.isSafeInteger(Number((value as Record<string, unknown>).n))
    && typeof (value as Record<string, unknown>).ciphertext === "string"
    && typeof (value as Record<string, unknown>).senderDeviceId === "string"
    && typeof (value as Record<string, unknown>).signature === "string"
  );
}

/**
 * Encrypts a room payload using HKDF derived AES-256-GCM.
 * 
 * @param {string} roomKey Hex representation of E2EE key (64 chars).
 * @param {string} roomId Associated room identifier.
 * @param {unknown} payload Data object to encrypt.
 * @param {number} [counter] Explicit ratchet counter. Defaults to Date.now().
 * @returns {Promise<EncryptedEnvelope>} Encrypted structure.
 * @throws {Error} If parameter limits are violated or encryption fails.
 */
export async function encryptRoomPayload(
  roomKey: string,
  roomId: string,
  payload: unknown,
  counter = Date.now()
): Promise<EncryptedEnvelope> {
  const normalizedRoomId = validateRoomId(roomId);
  const n = Number.isSafeInteger(counter) && counter > 0 ? counter : Date.now();
  const signer = await getSigner();
  const salt = new Uint8Array(MESSAGE_SALT_BYTES);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveMessageKey(roomKey, normalizedRoomId, salt, n);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  const aad = TEXT_ENCODER.encode(`${normalizedRoomId}:${n}:${encodeBase64Url(salt)}:${signer.deviceId}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: strictBuffer(iv), additionalData: strictBuffer(aad) },
    key,
    strictBuffer(plaintext)
  );

  const envelope: EncryptedEnvelope = {
    v: E2EE_ENVELOPE_VERSION,
    alg: E2EE_ALGORITHM,
    n,
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    roomId: normalizedRoomId,
    senderDeviceId: signer.deviceId,
    senderSigningKey: signer.publicKey
  };

  const privateKey = signer.privateCryptoKey;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    strictBuffer(signingPayload(envelope))
  );
  envelope.signature = encodeBase64Url(new Uint8Array(signature));

  return envelope;
}

/**
 * Decrypts a room envelope using HKDF derived AES-256-GCM.
 * 
 * @param {string} roomKey Hex representation of E2EE key (64 chars).
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
  const normalizedRoomId = validateRoomId(roomId);
  if (!isEncryptedEnvelope(envelope)) throw new Error("QXChat: Invalid encrypted envelope structure.");

  const publicKey = await importDevicePublicKey(envelope.senderSigningKey!);
  const validSignature = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    strictBuffer(decodeBase64Url(envelope.signature!)),
    strictBuffer(signingPayload(envelope))
  );
  if (!validSignature) throw new Error("QXChat: Invalid encrypted payload signature.");

  const n = Number(envelope.n);
  const salt = decodeBase64Url(envelope.salt);
  const iv = decodeBase64Url(envelope.iv);
  const ciphertext = decodeBase64Url(envelope.ciphertext);

  const key = await deriveMessageKey(roomKey, normalizedRoomId, salt, n);
  const aad = TEXT_ENCODER.encode(`${normalizedRoomId}:${n}:${encodeBase64Url(salt)}:${envelope.senderDeviceId}`);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: strictBuffer(iv), additionalData: strictBuffer(aad) },
    key,
    strictBuffer(ciphertext)
  );
  return JSON.parse(TEXT_DECODER.decode(plaintext));
}
