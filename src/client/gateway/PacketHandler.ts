import { OpCode, type GatewayPayload } from '../../types/gateway';
import { Events } from '../../types/events';
import { PresenceStatus } from '../../types/options';
import type { APIMessage, APIProfile } from '../../types/api';
import type { Username, RoomId } from '../../errors';
import type { SelfbotClient } from '../SelfbotClient';

/**
 * Handles all incoming gateway packets from the WebSocket connection.
 * Extracted from SelfbotClient to keep the client class focused on
 * connection management and action dispatch, not protocol parsing.
 *
 */
export class PacketHandler {
  private _client: SelfbotClient;

  constructor(client: SelfbotClient) {
    this._client = client;
  }

  /**
   * Main dispatch method. Routes a gateway payload to the appropriate handler.
   *
   * @param {GatewayPayload} payload The incoming gateway payload.
   */
  public async handle(payload: GatewayPayload): Promise<void> {
    const { op, d } = payload;
    if (d === null || d === undefined) return;
    if (typeof d !== 'object') return;
    const data = d as Record<string, unknown>;

    switch (op) {
      case OpCode.Hello:
        break;

      case OpCode.Identify:
        await this._onIdentify(data);
        break;

      case OpCode.Message:
      case OpCode.MessageEdited:
      case OpCode.MessageDeleted:
        await this._onMessage(data);
        break;

      case OpCode.Typing:
        this._onTyping(data);
        break;

      case OpCode.PresenceStatus:
        this._onPresenceUpdate(data);
        break;

      case OpCode.ProfileUpdate:
        this._onProfileUpdate(data);
        break;

      case OpCode.RoomSnapshot:
      case OpCode.RoomSnapshotPreserveTitle:
        this._onRoomSnapshot(data);
        break;

      case OpCode.ReactionSync:
        this._onReactionSync(data);
        break;

      case OpCode.RoomMessagesDeleted:
        this._onRoomMessagesClear(data);
        break;

      case OpCode.SystemBanner:
        this._onSystemBanner(data);
        break;

      case OpCode.Error:
        this._onError(data);
        break;

      case OpCode.VoiceState:
      case OpCode.CallChunk:
      case OpCode.MuteState:
      case OpCode.CallState:
      case OpCode.CallSignal:
        break;

      default:
        break;
    }
  }

  private async _onIdentify(data: Record<string, unknown>): Promise<void> {
    if (data.error) {
      this._client.emit(Events.Error, new Error(`Identify failed: ${String(data.error)}`));
      this._client.logout();
      return;
    }

    this._client.userId = String(data.uuid || data.id || data.userId || '');
    if (data.username) {
      this._client.username = String(data.username) as Username;
    }
    if (data.admin !== undefined) {
      this._client.isAdmin = Boolean(data.admin);
    }
    if (Array.isArray(data.badges)) {
      this._client.badges = data.badges.map(String);
      if (this._client.username) {
        const key = this._client.username.trim().toLowerCase() as Username;
        this._client.cache.badgesByUser.set(key, this._client.badges);
      }
    }

    this._client.identified = true;
    this._client.emit(Events.Ready, this._client);
  }

  private async _onMessage(data: Record<string, unknown>): Promise<void> {
    if (data.error) return;
    if (!data.messageId || typeof data.timestamp !== 'number') return;

    const rawMsg = data as unknown as APIMessage;
    const msg = await this._client.cache.decryptAndNormalizeMessage(
      rawMsg,
      (rawMsg.roomId || rawMsg.gameId) as RoomId | undefined
    );

    if (rawMsg.deleted) {
      this._client.emit(Events.MessageDelete, {
        roomId: msg.roomId,
        messageId: msg.messageId,
      });
    } else if (rawMsg.editedAt) {
      this._client.emit(Events.MessageUpdate, msg);
    } else {
      this._client.emit(Events.MessageCreate, msg);
    }
  }

  private _onTyping(data: Record<string, unknown>): void {
    if (!data.gameId || !data.username) return;

    const roomId = String(data.gameId) as RoomId;
    const username = String(data.username) as Username;

    if (data.typing) {
      this._client.emit(Events.TypingStart, { roomId, username });
    } else {
      this._client.emit(Events.TypingEnd, { roomId, username });
    }
  }

  private _onPresenceUpdate(data: Record<string, unknown>): void {
    if (!data.user) return;

    const username = String(data.user) as Username;
    const status = (String(data.status || PresenceStatus.Online) as PresenceStatus) || PresenceStatus.Online;
    this._client.cache.statusesByUser.set(username, status);

    if (data.profile) {
      const existing = this._client.cache.profilesByUser.get(username) || {};
      this._client.cache.profilesByUser.set(username, {
        ...existing,
        ...(data.profile as APIProfile),
      });
    }

    this._client.emit(Events.PresenceUpdate, { username, status });
  }

  private _onProfileUpdate(data: Record<string, unknown>): void {
    const user = String(data.user || '') as Username;
    if (!user) return;

    const incomingProfile = data.profile as APIProfile | undefined;
    if (incomingProfile) {
      const existing = this._client.cache.profilesByUser.get(user) || {};
      this._client.cache.profilesByUser.set(user, { ...existing, ...incomingProfile });
    }

    this._client.cache.updateRoomCache(data);
    this._client.emit(Events.ProfileUpdate, {
      username: user,
      profile: this._client.cache.profilesByUser.get(user) || {},
    });
  }

  private _onRoomSnapshot(data: Record<string, unknown>): void {
    const room = this._client.cache.updateRoomCache(data);
    this._client.emit(Events.RoomUpdate, room);
  }

  private _onReactionSync(data: Record<string, unknown>): void {
    if (!data.messageId || !data.gameId) return;

    this._client.emit(Events.MessageReactionUpdate, {
      roomId: String(data.gameId) as RoomId,
      messageId: String(data.messageId),
      reactions: Array.isArray(data.reactions) ? data.reactions.map(String) : [],
    });
  }

  private _onRoomMessagesClear(data: Record<string, unknown>): void {
    if (!data.gameId) return;

    this._client.emit(Events.RoomMessagesClear, {
      roomId: String(data.gameId) as RoomId,
      messageIds: Array.isArray(data.messageIds) ? data.messageIds.map(String) : [],
    });
  }

  private _onSystemBanner(data: Record<string, unknown>): void {
    if (data.message) {
      this._client.emit(Events.SystemBanner, { message: String(data.message) });
    }
  }

  private _onError(data: Record<string, unknown>): void {
    if (data.error) {
      this._client.emit(Events.Error, new Error(`Server Error: ${String(data.error)}`));
    }
  }
}
