import type { Room } from '@client/Room';
import type { Message } from '@client/Message';
import type { SelfbotClient } from '@websocket';
import type { Username, RoomId } from '@errors';


/**
 * OP CODES used in the QXChat/lqxp WebSocket protocol.
 */
export enum OpCode {
  /** Server-sent error (op 0). */
  Error = 0,
  /** Heartbeat ping/ack — client sends, server echoes (op 1). */
  Heartbeat = 1,
  /** Client login/authentication (op 2). */
  Identify = 2,
  /** Client room join request (op 3). */
  Join = 3,
  /** Client room leave request (op 4). */
  Leave = 4,
  /** Client sends a new message / server broadcasts a message (op 7). */
  Message = 7,
  /** Client sends client settings patch: status, profile, deleteMessagesOnLeave, etc. (op 8). */
  SyncClientSettings = 8,
  /** Server hello — contains heartbeat_interval (op 10). */
  Hello = 10,
  /** WebSocket frame acknowledgment (op 13). */
  Ack = 13,
  /** Client requests room history / server responds with history batch (op 18). */
  History = 18,
  /** Client toggles an emoji reaction on a message (op 19). */
  ReactionSend = 19,
  /** Server broadcasts updated reactions for a message (op 20). */
  ReactionSync = 20,
  /** Client deletes a message (op 21). */
  DeleteMessage = 21,
  /** Server broadcasts a message deletion (op 22). */
  MessageDeleted = 22,
  /** Server sends an embed preview for a URL in a message (op 23). */
  Preview = 23,
  /** Server notifies a blacklisted/banned client (op 24). */
  Blacklisted = 24,
  /** Server broadcasts a bulk room message clear (op 25). */
  RoomMessagesDeleted = 25,
  /** Server broadcasts a user profile update (op 26). */
  ProfileUpdate = 26,
  /** Server/client exchanges presence/status updates (op 27). */
  PresenceStatus = 27,
  /** Server signals a presence status error (op 28). */
  PresenceStatusError = 28,
  /** Client sends an edit for an existing message (op 29). */
  EditMessage = 29,
  /** Server broadcasts an edited message to all room members (op 30). */
  MessageEdited = 30,
  /** Client/server typing state toggle (op 31). */
  Typing = 31,
  /** Server broadcasts room snapshot, preserving local title (op 32). */
  RoomSnapshotPreserveTitle = 32,
  /** Server/client broadcasts room metadata update (op 33). */
  RoomSnapshot = 33,
  /** Server sends a system-wide banner message (op 87). */
  SystemBanner = 87,
  /** Voice state update packet (op 98). */
  VoiceState = 98,
  /** Voice/WebRTC call payload relay chunk (op 99). */
  CallChunk = 99,
  /** WebRTC call state negotiation (op 110). */
  CallState = 110,
  /** WebRTC call signal relay (op 111). */
  CallSignal = 111,
}

/** Presence status modes. */
export enum PresenceStatus {
  Online = 'online',
  Invisible = 'invisible',
  DoNotDisturb = 'dnd',
}

export enum ProfileImageKind {
  Avatar = 'avatar',
  Banner = 'banner',
}

/** Recognized client platforms. */
export enum ClientPlatform {
  Web = 'web',
  Desktop = 'desktop',
  Android = 'android',
  IOS = 'ios',
  Mobile = 'mobile',
}

/** Raw WebSocket envelope structure. */
export interface GatewayPayload<T = unknown> {
  op: OpCode;
  d: T;
  /** Optional sequence or sender metadata for voice relay. */
  u?: string;
}

/** E2EE payload container schema. */
export interface EncryptedEnvelope {
  v: number;
  alg: string;
  n: number;
  salt: string;
  iv: string;
  ciphertext: string;
  roomId?: string;
}

/** Options for client configuration. */
export interface ClientOptions {
  /** WebSocket Server URL. Defaults to 'wss://qxch.at/ws'. */
  wsUrl?: string;
  /** Platform identifier. Defaults to 'desktop'. */
  platform?: ClientPlatform | string;
  /** Unique client identifier. Defaults to auto-generated UUID. */
  clientId?: string;
  /** Custom client version tag. Defaults to 'qxchat.ts'. */
  version?: string;
  /** Automatic reconnection flags. Defaults to true. */
  autoReconnect?: boolean;
  /** Minimum reconnect delay backoff in ms. Defaults to 1000. */
  minReconnectDelay?: number;
  /** Maximum reconnect delay backoff in ms. Defaults to 30000. */
  maxReconnectDelay?: number;
  /** Optional Proxy URL (e.g. 'http://user:pass@proxy:8080') for native Bun fetch & WebSocket. */
  proxy?: string;
}

export enum Events {
  Ready = 'ready',
  MessageCreate = 'message',
  MessageUpdate = 'messageUpdate',
  MessageDelete = 'messageDelete',
  RoomMessagesClear = 'roomMessagesClear',
  RoomUpdate = 'roomUpdate',
  MessageReactionUpdate = 'messageReactionUpdate',
  TypingStart = 'typingStart',
  TypingEnd = 'typingEnd',
  PresenceUpdate = 'presenceUpdate',
  UserJoin = 'userJoin',
  UserLeave = 'userLeave',
  ProfileUpdate = 'profileUpdate',
  Error = 'error',
  Disconnect = 'disconnect',
}

/** Events mapping for the SelfbotClient. */
export interface ClientEvents {
  ready: (client: SelfbotClient) => void;
  message: (message: Message) => void;
  messageUpdate: (message: Message) => void;
  messageDelete: (data: { roomId: RoomId; messageId: string }) => void;
  roomMessagesClear: (data: { roomId: RoomId; messageIds: string[] }) => void;
  roomUpdate: (room: Room) => void;
  messageReactionUpdate: (data: { roomId: RoomId; messageId: string; reactions: string[] }) => void;
  typingStart: (data: { roomId: RoomId; username: Username }) => void;
  typingEnd: (data: { roomId: RoomId; username: Username }) => void;
  presenceUpdate: (data: { username: Username; status: PresenceStatus }) => void;
  userJoin: (data: { roomId: RoomId; username: Username }) => void;
  userLeave: (data: { roomId: RoomId; username: Username }) => void;
  profileUpdate: (data: { username: Username; profile: APIProfile }) => void;
  error: (err: Error) => void;
  disconnect: (reason: string) => void;
}

export type {
  Username,
  RoomId,
  RoomTitle,
  RoomNote,
  Pronouns,
  ProfileDescription,
  MessageText,
  ValidateUsernameType,
  ValidateRoomIdType,
  ValidateRoomTitleType
} from '@errors';

/** Client Identify payload (OpCode 2). */
export interface IdentifyPayload {
  username: string;
  token: string;
  isVoiceChat?: boolean;
  deleteMessagesOnLeave?: boolean;
  status?: PresenceStatus;
  profile?: APIProfile;
  clientId?: string;
  platform?: ClientPlatform | string;
  v?: string;
  isMobile?: boolean;
  isSecure?: boolean;
}

/** Raw user profile structure inside the QXChat server data. */
export interface APIProfile {
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  description?: string;
  pronouns?: string;
  themeColor?: string;
  [key: string]: unknown;
}

/** Raw attachment structure. */
export interface APIAttachment {
  id?: string;
  url?: string;
  filename: string;
  mimeType?: string;
  size: number;
  dataB64?: string;
}

/** Raw message object from server. */
export interface APIMessage {
  messageId: string;
  roomId?: string;
  gameId?: string;
  user?: string;
  username?: string;
  text?: string;
  timestamp?: number;
  system?: boolean;
  deleted?: boolean;
  reactions?: string[];
  replyToMessageId?: string;
  attachment?: APIAttachment | null;
  encrypted?: EncryptedEnvelope | null;
  preview?: unknown;
  editedAt?: number;
  mentioned?: boolean;
}

/** Gateway Hello payload (OpCode 10). */
export interface HelloPayload {
  heartbeat_interval: number;
}

/** Normalized attachment structure. */
export interface Attachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  dataB64: string;
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

/** Message details shape. */
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

/** Room snapshot shape. */
export interface RoomData {
  roomId: string;
  title: string;
  iconUrl: string;
  members: string[];
  lastPreview?: string;
  lastTimestamp?: number;
  lastSender?: string;
}

/** User profile metadata. */
export interface Profile {
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  description: string;
  pronouns: string;
}

declare global {
  interface RequestInit {
    proxy?: string;
  }
}
