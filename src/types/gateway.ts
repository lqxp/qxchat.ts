/**
 * WebSocket gateway protocol types OpCodes, payloads, and enums.
 * Mirrors the Rust server constants in `lqxp/rust/src/websocket/protocol.rs`
 * and `lqxp/rust/src/models.rs`.
 */

/**
 * OP CODES used in the QXChat/lqxp WebSocket protocol.
 * Every value here corresponds to a handler in the Rust `process_message` function.
 */
export enum OpCode {
  /** Server-sent error (op 0). */
  Error = 0,
  /** Heartbeat ping/ack, client sends, server echoes (op 1). */
  Heartbeat = 1,
  /** Client login/authentication (op 2). */
  Identify = 2,
  /** Client room join request (op 3). */
  Join = 3,
  /** Client room leave request (op 4). */
  Leave = 4,
  /** Server game/kill event (op 5), reserved, unused in chat context. */
  ReportKill = 5,
  /** Version check packet (op 6). */
  VersionCheck = 6,
  /** Client sends a new message / server broadcasts a message (op 7). */
  Message = 7,
  /** Client sends client settings patch: status, profile, deleteMessagesOnLeave, etc. (op 8). */
  SyncClientSettings = 8,
  /** Server hello, contains heartbeat_interval (op 10). */
  Hello = 10,
  /** WebSocket frame acknowledgment (op 13). */
  Ack = 13,
  /** Client requests room history / server responds with history batch (op 18). */
  History = 18,
  /** Client toggles an emoji reaction on a message (op 19). Sends to server. */
  ReactionSend = 19,
  /** Server broadcasts updated reactions for a message (op 20). Received from server. */
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
  /** Client requests link preview for a message (op 28). */
  RequestLinkPreview = 28,
  /** Client sends an edit for an existing message (op 29). */
  EditMessage = 29,
  /** Server broadcasts an edited message to all room members (op 30). */
  MessageEdited = 30,
  /** Client/server typing state toggle (op 31). */
  Typing = 31,
  /** Server broadcasts room snapshot, preserving local title (op 32). */
  RoomSnapshotPreserveTitle = 32,
  /** Server/client broadcasts room metadata update including title (op 33). */
  RoomSnapshot = 33,
  /** Server sends a system-wide banner message (op 87). */
  SystemBanner = 87,
  /** Voice state update packet (op 98). */
  VoiceState = 98,
  /** Voice/WebRTC call payload relay chunk (op 99). */
  CallChunk = 99,
  /** Mute/unmute state update (op 100). */
  MuteState = 100,
  /** Admin status command (op 101). */
  AdminStatus = 101,
  /** Admin broadcast message (op 104). */
  AdminBroadcast = 104,
  /** Stats query (op 105). */
  StatsQuery = 105,
  /** WebRTC call state negotiation (op 110). */
  CallState = 110,
  /** WebRTC call signal relay (op 111). */
  CallSignal = 111,
}

/** Raw WebSocket envelope structure. */
export interface GatewayPayload<T = unknown> {
  op: OpCode;
  d: T;
  /** Optional sequence or sender metadata for voice relay. */
  u?: string;
  /** Optional request ID for request/response correlation. */
  rid?: string;
}

/** Client Identify payload (OpCode 2). */
export interface IdentifyPayload {
  username: string;
  token: string;
  isVoiceChat?: boolean;
  deleteMessagesOnLeave?: boolean;
  status?: string;
  profile?: unknown;
  clientId?: string;
  platform?: string;
  v?: string;
  isMobile?: boolean;
  isSecure?: boolean;
}

/** Gateway Hello payload (OpCode 10). */
export interface HelloPayload {
  heartbeat_interval: number;
}
