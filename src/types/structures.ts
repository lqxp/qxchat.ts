export type JsonWebKey = {
  kty?: string;
  alg?: string;
  use?: string;
  key_ops?: string[];
  ext?: boolean;
  [key: string]: unknown;
};


/** E2EE payload container schema. Mirrors `EncryptedPayload` in lqxp/rust/src/models.rs. */
export interface EncryptedEnvelope {
  v: number;
  alg: string;
  n: number;
  salt: string;
  iv: string;
  ciphertext: string;
  roomId?: string;
  senderDeviceId?: string;
  senderSigningKey?: JsonWebKey;
  signature?: string;
}

/** Message attachment/content type kinds. */
export enum MessageKind {
  Text = 'text',
  Deleted = 'deleted',
  File = 'file',
  Audio = 'audio',
  Image = 'image',
  Video = 'video',
  Voice = 'voice',
}

/** Normalized attachment after processing from the server's APIAttachment. */
export interface Attachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  dataB64: string;
}

/** Normalized message data shape used to construct Message instances. */
export interface MessageData {
  messageId: string;
  roomId: string;
  user: string;
  username: string;
  text: string;
  rawText: string;
  timestamp: number;
  system: boolean;
  deleted: boolean;
  reactions: string[];
  replyToMessageId: string;
  attachment: Attachment | null;
  encrypted: EncryptedEnvelope | null;
  preview: unknown;
  kind: MessageKind;
  voiceDuration: number | null;
  jumboEmoji: boolean;
  locked: boolean;
  editedAt: number;
  mentioned: boolean;
}

/** Normalized room data shape used to construct Room instances. */
export interface RoomData {
  roomId: string;
  title: string;
  iconUrl: string;
  members: string[];
  lastPreview?: string;
  lastTimestamp?: number;
  lastSender?: string;
}

/** Normalized user profile. */
export interface Profile {
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  description: string;
  pronouns: string;
  themeColor: string;
}

declare global {
  interface RequestInit {
    proxy?: string;
  }
}
