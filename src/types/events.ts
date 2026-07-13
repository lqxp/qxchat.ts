/**
 * Client event names and their callback signatures.
 */
import type { PresenceStatus } from './options';
import type { Username, RoomId } from '../errors';
import type { APIProfile } from './api';

/** Event name string enum for the SelfbotClient. */
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
  SystemBanner = 'systemBanner',
  Error = 'error',
  Disconnect = 'disconnect',
}

/**
 * Type-safe events map for the SelfbotClient.
 * Each key is an event name, each value is the listener signature.
 * Import Message and Room lazily to avoid circular deps.
 */
export interface ClientEvents {
  ready: (client: import('../client/SelfbotClient').SelfbotClient) => void;
  message: (message: import('../structures/Message').Message) => void;
  messageUpdate: (message: import('../structures/Message').Message) => void;
  messageDelete: (data: { roomId: RoomId; messageId: string }) => void;
  roomMessagesClear: (data: { roomId: RoomId; messageIds: string[] }) => void;
  roomUpdate: (room: import('../structures/Room').Room) => void;
  messageReactionUpdate: (data: { roomId: RoomId; messageId: string; reactions: string[] }) => void;
  typingStart: (data: { roomId: RoomId; username: Username }) => void;
  typingEnd: (data: { roomId: RoomId; username: Username }) => void;
  presenceUpdate: (data: { username: Username; status: PresenceStatus }) => void;
  userJoin: (data: { roomId: RoomId; username: Username }) => void;
  userLeave: (data: { roomId: RoomId; username: Username }) => void;
  profileUpdate: (data: { username: Username; profile: APIProfile }) => void;
  systemBanner: (data: { message: string }) => void;
  error: (err: Error) => void;
  disconnect: (reason: string) => void;
}
