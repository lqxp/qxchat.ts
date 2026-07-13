/** Default WebSocket gateway URL. */
export const DEFAULT_WS_URL = 'wss://qxch.at/ws';

/** Default HTTP API base URL. */
export const DEFAULT_API_URL = 'https://qxch.at';

/** Default client version tag sent during Identify. */
export const DEFAULT_VERSION = 'qxchat.ts';

/** Default minimum reconnect delay in ms. */
export const DEFAULT_MIN_RECONNECT_DELAY = 1_000;

/** Default maximum reconnect delay in ms. */
export const DEFAULT_MAX_RECONNECT_DELAY = 30_000;

/** Maximum consecutive reconnect attempts before capping delay. */
export const MAX_RECONNECT_EXPONENT = 6;

/** Snapshot serialization version. Bump when snapshot shape changes. */
export const SNAPSHOT_VERSION = 5;

/**
 * Runtime limit constants, mirroring those enforced by the lqxp server
 */
export const LIMITS = {
  /** Maximum message body length in characters. */
  MESSAGE_LIMIT: 2000,
  /** Minimum room ID length. */
  ROOM_ID_MIN_LENGTH: 8,
  /** Maximum room ID length. */
  ROOM_ID_MAX_LENGTH: 64,
  /** Maximum local room note length. */
  MAX_ROOM_NOTE_LENGTH: 512,
  /** Maximum local room title length. */
  MAX_LOCAL_ROOM_NAME_LENGTH: 64,
  /** Maximum profile pronouns length. */
  MAX_PROFILE_PRONOUNS_LENGTH: 24,
  /** Maximum profile bio description length. */
  MAX_PROFILE_DESCRIPTION_LENGTH: 512,
  /** Maximum attachment size (25 MB). */
  MAX_ATTACHMENT_BYTES: 25 * 1024 * 1024,
  /** Maximum profile avatar image size (2 MB). */
  MAX_PROFILE_AVATAR_BYTES: 2 * 1024 * 1024,
  /** Maximum profile banner image size (5 MB). */
  MAX_PROFILE_BANNER_BYTES: 5 * 1024 * 1024,
  /** Maximum filename length for attachments. */
  MAX_FILENAME_LENGTH: 128,
  /** Room access invite token length (32 bytes roomId + 64 bytes roomKey = 96 hex chars). */
  ROOM_TOKEN_LENGTH: 96,
} as const;
