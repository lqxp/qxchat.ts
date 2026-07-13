/**
 * Raw API data shapes as returned by the lqxp server.
 * These are plain data transfer objects, not model classes.
 */

/** Raw user profile structure from the server. */
export interface APIProfile {
  /** Display name (may differ from username). */
  displayName?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** Banner image URL. */
  bannerUrl?: string;
  /** Bio description. */
  description?: string;
  /** Pronouns string. */
  pronouns?: string;
  /** Custom theme color hex. */
  themeColor?: string;
  [key: string]: unknown;
}

/** Raw attachment structure as stored and returned by the server. */
export interface APIAttachment {
  id?: string;
  url?: string;
  filename: string;
  mimeType?: string;
  size: number;
  dataB64?: string;
}

/** Raw message object from the server. */
export interface APIMessage {
  messageId: string;
  /** Primary room ID field used by newer server versions. */
  roomId?: string;
  /** Legacy/alias room ID field. Always prefer `roomId`, fall back to `gameId`. */
  gameId?: string;
  /** User UUID. */
  user?: string;
  /** Username (display). */
  username?: string;
  text?: string;
  timestamp?: number;
  system?: boolean;
  deleted?: boolean;
  reactions?: string[];
  replyToMessageId?: string;
  attachment?: APIAttachment | null;
  encrypted?: import('./structures').EncryptedEnvelope | null;
  preview?: unknown;
  editedAt?: number;
  mentioned?: boolean;
}

/** Room icon as returned from the server. Mirrors `RoomIcon` in models.rs. */
export interface APIRoomIcon {
  url?: string;
  file?: {
    url?: string;
    id?: string;
    size?: number;
    mimeType?: string;
  };
}

/** Room record as returned from the server. Mirrors `RoomRecord` in models.rs. */
export interface APIRoomRecord {
  room_id?: string;
  roomId?: string;
  title?: string;
  icon?: APIRoomIcon;
  members?: Array<string | { username?: string; user?: string }>;
  lastPreview?: string;
  lastTimestamp?: number;
  lastSender?: string;
}
