import type { RoomId, RoomTitle, RoomNote } from '../errors';
import type { APIProfile } from '../types/api';
import type { MessageBuilder } from '../builders/MessageBuilder';
import type { RoomBuilder } from '../builders/RoomBuilder';

export interface IActionClient {
  readonly username: string;

  // Message actions
  sendMessage(roomId: RoomId | string, content: string | MessageBuilder): Promise<void>;
  editMessage(roomId: RoomId | string, messageId: string, content: string | MessageBuilder): Promise<void>;
  deleteMessage(roomId: RoomId | string, messageId: string): Promise<void>;
  toggleReaction(roomId: RoomId | string, messageId: string, emojis: string | string[]): Promise<void>;

  // Room actions
  leaveRoom(roomId: RoomId | string): Promise<void>;
  setRoomTitle(roomId: RoomId | string, title: RoomTitle | RoomBuilder | string): Promise<void>;
  fetchHistory(roomId: RoomId | string, limit?: number, beforeMessageId?: string): Promise<void>;
  sendTyping(roomId: RoomId | string, typing: boolean): Promise<void>;
  uploadRoomIcon(roomId: RoomId | string, fileBuffer: Uint8Array | ArrayBuffer | Blob, filename?: string): Promise<string>;

  // Cache/note actions
  setRoomNote(roomId: RoomId | string, note: RoomNote | string): void;
  getRoomNote(roomId: RoomId | string): RoomNote;

  // Key access
  readonly roomKeys: Map<RoomId, string>;

  // Profile
  getUserProfile(username: string): APIProfile | null;
}
