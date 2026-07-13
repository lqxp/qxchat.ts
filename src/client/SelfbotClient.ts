import {
  OpCode,
  PresenceStatus,
  type APIMessage,
  type ClientOptions,
  type APIProfile,
  Events,
} from '../types';
import { Room } from '../structures/Room';
import { Message } from '../structures/Message';
import {
  sanitizeAndValidateUsername,
  validateRoomId,
  validateRoomTitle,
  type Username,
  type RoomId,
  type RoomTitle,
  type RoomNote,
} from '../errors';
import { generateRoomAccessToken } from '../crypto/e2ee';
import { MessageBuilder, RoomBuilder } from '../builders';
import { BaseClient } from './BaseClient';
import { WebSocketManager } from './gateway/WebSocketManager';
import { CacheManager } from './managers/CacheManager';
import type { IActionClient } from '../structures/IActionClient';

/**
 * Class of the QxChat selfbot client.
 */
export class SelfbotClient extends BaseClient implements IActionClient {
  /** WebSocket gateway manager. */
  public ws!: WebSocketManager;
  /** In-memory cache manager for rooms, keys, profiles and notes. */
  public readonly cache: CacheManager;

  /** True when the WebSocket connection is established and open. */
  public get connected(): boolean {
    return this.ws.connected;
  }
  /** The ping latency of the WebSocket gateway connection in milliseconds. */
  public get ping(): number {
    return this.ws.ping;
  }
  /** True after a successful Identify exchange with the server. */
  public identified = false;
  /** Current presence status broadcast to other users. */
  public status: PresenceStatus = PresenceStatus.Online;
  /** Whether to delete messages on leave. */
  public deleteMessagesOnLeave = false;
  /** Whether the server clears local messages on leave. */
  public serverClearsLocalMessages = false;

  public get roomKeys() { return this.cache.roomKeys; }
  public get roomRatchets() { return this.cache.roomRatchets; }
  public get rooms() { return this.cache.rooms; }
  public get activeRoomsList() { return this.cache.activeRoomsList; }
  public get roomNotes() { return this.cache.roomNotes; }
  public get usersByRoom() { return this.cache.usersByRoom; }
  public get profilesByUser() { return this.cache.profilesByUser; }
  public get statusesByUser() { return this.cache.statusesByUser; }
  public get badgesByUser() { return this.cache.badgesByUser; }
  public get badges(): string[] { return this.cache.badges; }
  public set badges(b: string[]) { this.cache.badges = b; }

  constructor(options: ClientOptions = {}) {
    super(options);
    this.cache = new CacheManager(this);
    this.ws = new WebSocketManager(this);
    this._dnsPrefetch();
  }

  private _dnsPrefetch(): void {
    try {
      const host = new URL(this.options.wsUrl).hostname;
      if (typeof Bun !== 'undefined' && Bun.dns && typeof Bun.dns.prefetch === 'function') {
        Bun.dns.prefetch(host);
      }
    } catch {}
  }

  /**
   * Connects to the WebSocket gateway using the selfbot account details.
   * If only one argument is provided, it is treated as the session token and
   * the username will be automatically fetched from the QXChat REST API.
   *
   * @param {string} tokenOrUsername Session token (if 1 arg) or username (if 2 args).
   * @param {string} [token] Raw authentication token (only when 2 args are given).
   * @throws {Error} If the token is missing or invalid, or if the profile fetch fails.
   */
  public async login(tokenOrUsername: string, token?: string): Promise<void> {
    let activeUsername = '';
    let activeToken = '';

    if (token === undefined) {
      activeToken = tokenOrUsername.trim();
      if (!activeToken) throw new Error('QXChat: Authentication token is required.');

      const res = await fetch(`${this.getApiBase()}/api/auth/me`, {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${activeToken}`,
        },
        proxy: this.options.proxy || undefined,
      });

      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        user?: { username?: string };
      };
      if (!res.ok || d?.ok === false) {
        throw new Error(d?.error || `Profile fetch failed during token-only login: HTTP ${res.status}`);
      }

      const fetched = d.user?.username || '';
      if (!fetched) {
        throw new Error('QXChat: Server did not return a valid username for the provided token.');
      }
      activeUsername = fetched;
    } else {
      activeUsername = tokenOrUsername;
      activeToken = token.trim();
      if (!activeToken) throw new Error('QXChat: Authentication token is required.');
    }

    const cleanUsername = sanitizeAndValidateUsername(activeUsername);
    this.username = cleanUsername;
    this.authToken = activeToken;
    this._dnsPrefetch();
    this.ws.connectGateway();
  }

  /**
   * Disconnects the selfbot from the gateway.
   */
  public logout(): void {
    this.identified = false;
    this.ws.disconnectGateway('Manual logout called');
  }

  private _send(op: OpCode, d: unknown): void {
    this.ws.sendPayload(op, d);
  }

  /**
   * Registers a room encryption key for a specific room.
   * @param {RoomId | string} roomId The room ID.
   * @param {string} roomKey The 32-byte hex room encryption key.
   */
  public registerRoomKey(roomId: RoomId | string, roomKey: string): void {
    this.cache.registerRoomKey(roomId, roomKey);
  }

  /**
   * Parses and registers a 96-character room access invite token.
   * @param {string} token The 96-char invite token.
   * @returns {RoomId} The parsed room ID.
   */
  public registerRoomToken(token: string): RoomId {
    return this.cache.registerRoomToken(token);
  }

  /**
   * Decrypts and normalizes a raw API message into a Message instance.
   * @param {APIMessage} rawMessage Raw server message object.
   * @param {RoomId | string} [fallbackRoomId] Room ID to use if not in payload.
   * @returns {Promise<Message>} Normalized Message instance.
   */
  public decryptAndNormalizeMessage(rawMessage: APIMessage, fallbackRoomId?: RoomId | string): Promise<Message> {
    return this.cache.decryptAndNormalizeMessage(rawMessage, fallbackRoomId);
  }

  /**
   * Finds all rooms shared between the current user and another user.
   * @param {Username | string} username Target username.
   * @returns {Room[]} Shared rooms.
   */
  public mutualRoomsWith(username: Username | string): Room[] {
    return this.cache.mutualRoomsWith(username);
  }

  /**
   * Retrieves a user's cached profile.
   * @param {Username | string} username Target username.
   * @returns {APIProfile | null} Profile or null if not cached.
   */
  public getUserProfile(username: Username | string): APIProfile | null {
    return this.cache.getUserProfile(username);
  }

  /**
   * Gets the cached member list for a room.
   * @param {RoomId | string} roomId Target room ID.
   * @returns {Username[]} Member username list.
   */
  public getRoomMembers(roomId: RoomId | string): Username[] {
    return this.cache.getRoomMembers(roomId);
  }

  /**
   * Exports the full client session state as a JSON string.
   * @returns {string} Snapshot JSON.
   */
  public exportSnapshot(): string {
    return this.cache.exportSnapshot();
  }

  /**
   * Restores client caches from a previously exported snapshot string.
   * @param {string} json Snapshot JSON.
   */
  public importSnapshot(json: string): void {
    this.cache.importSnapshot(json);
  }

  /**
   * Sets a local client-side note for a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {RoomNote | string} note Note text.
   */
  public setRoomNote(roomId: RoomId | string, note: RoomNote | string): void {
    this.cache.setRoomNote(roomId, note);
  }

  /**
   * Gets the local client-side note for a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @returns {RoomNote} Note text or empty string.
   */
  public getRoomNote(roomId: RoomId | string): RoomNote {
    return this.cache.getRoomNote(roomId);
  }

  /**
   * Joins a room using an invite token (derives E2EE key) or raw room ID.
   * @param {string} tokenOrRoomId 96-char room access invite token or 32-char hex room ID.
   * @param {{ silentJoin?: boolean }} [options] Join options.
   */
  public async joinRoom(tokenOrRoomId: string, options?: { silentJoin?: boolean }): Promise<void> {
    let roomId = tokenOrRoomId;
    if (tokenOrRoomId.length === 96) {
      roomId = this.registerRoomToken(tokenOrRoomId);
    }
    validateRoomId(roomId);
    this._send(OpCode.Join, {
      gameId: roomId,
      silentJoin: options?.silentJoin === true,
    });
  }

  /**
   * Leaves a room.
   * @param {RoomId | string} roomId The room ID.
   */
  public async leaveRoom(roomId: RoomId | string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.Leave, { gameId: cleanRoomId });
  }

  /**
   * Sends a message to a room. Automatically E2EE-encrypts if a key is registered.
   * @param {RoomId | string} roomId The room ID.
   * @param {string | MessageBuilder} content Message body text or MessageBuilder instance.
   */
  public async sendMessage(roomId: RoomId | string, content: string | MessageBuilder): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const builder = content instanceof MessageBuilder ? content : new MessageBuilder(content);
    const key = this.roomKeys.get(cleanRoomId);

    if (key) {
      const nextCounter = Math.max(0, Math.floor(this.roomRatchets.get(cleanRoomId) || 0)) + 1;
      this.roomRatchets.set(cleanRoomId, nextCounter);
      const encrypted = await builder.toEncrypted(key, cleanRoomId, nextCounter);
      this._send(OpCode.Message, { gameId: cleanRoomId, encrypted });
    } else {
      this._send(OpCode.Message, {
        gameId: cleanRoomId,
        text: builder.text,
        replyToMessageId: builder.replyToMessageId || undefined,
        attachment: builder.attachment || undefined,
      });
    }
  }

  /**
   * Edits an existing message in a room. Encrypts the payload if an E2EE key is registered.
   * @param {RoomId | string} roomId The room ID.
   * @param {string} messageId ID of the message to edit.
   * @param {string | MessageBuilder} content New message body text or MessageBuilder instance.
   */
  public async editMessage(
    roomId: RoomId | string,
    messageId: string,
    content: string | MessageBuilder
  ): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const builder = content instanceof MessageBuilder ? content : new MessageBuilder(content);
    const key = this.roomKeys.get(cleanRoomId);

    if (key) {
      const nextCounter = Math.max(0, Math.floor(this.roomRatchets.get(cleanRoomId) || 0)) + 1;
      this.roomRatchets.set(cleanRoomId, nextCounter);
      const encrypted = await builder.toEncrypted(key, cleanRoomId, nextCounter);
      this._send(OpCode.EditMessage, { gameId: cleanRoomId, messageId, encrypted });
    } else {
      this._send(OpCode.EditMessage, {
        gameId: cleanRoomId,
        messageId,
        text: builder.text,
        attachment: builder.attachment || undefined,
      });
    }
  }

  /**
   * Deletes a message from a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {string} messageId ID of message to delete.
   */
  public async deleteMessage(roomId: RoomId | string, messageId: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.DeleteMessage, { gameId: cleanRoomId, messageId });
  }

  /**
   * Sends a typing indicator status to a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {boolean} typing True if typing, false if stopped.
   */
  public async sendTyping(roomId: RoomId | string, typing: boolean): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.Typing, { gameId: cleanRoomId, typing: Boolean(typing) });
  }

  /**
   * Updates the title of a room.
   * Uses OpCode.RoomSnapshot (33) = update_room_title on the server.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {RoomTitle | RoomBuilder | string} title New title string or RoomBuilder.
   */
  public async setRoomTitle(
    roomId: RoomId | string,
    title: RoomTitle | RoomBuilder | string
  ): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const rawTitle = title instanceof RoomBuilder ? title.title : title;
    const cleanTitle = validateRoomTitle(rawTitle);
    this._send(OpCode.RoomSnapshot, { gameId: cleanRoomId, title: cleanTitle });
  }

  /**
   * Requests previous message history for a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {number} [_limit] Unused (server controls limit). Kept for API compat.
   * @param {string} [_beforeMessageId] Unused (server controls pagination). Kept for API compat.
   */
  public async fetchHistory(roomId: RoomId | string, _limit = 50, _beforeMessageId?: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.History, { gameId: cleanRoomId });
  }

  /**
   * Requests a link preview update for a message URL.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {string} messageId Target message ID.
   * @param {string} url The URL to preview.
   */
  public async requestLinkPreview(roomId: RoomId | string, messageId: string, url: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.RequestLinkPreview, { gameId: cleanRoomId, messageId, url });
  }

  /**
   * Updates the client's presence status.
   * @param {PresenceStatus | 'online' | 'idle' | 'dnd' | 'offline'} status Next presence status.
   */
  public async updatePresence(status: PresenceStatus | 'online' | 'idle' | 'dnd' | 'offline'): Promise<void> {
    this.status = status as PresenceStatus;
    this._send(OpCode.SyncClientSettings, {
      status: String(status),
      clientId: this.options.clientId,
    });
  }

  /**
   * Publishes profile changes to the QXChat network.
   * @param {Partial<APIProfile>} profile User profile properties to update.
   */
  public async updateProfile(profile: Partial<APIProfile>): Promise<void> {
    this._send(OpCode.ProfileUpdate, { profile });
  }

  /**
   * Toggles a reaction emoji on a message.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {string} messageId Target message ID.
   * @param {string | string[]} emojis Reaction emoji(s) to toggle.
   */
  public async toggleReaction(
    roomId: RoomId | string,
    messageId: string,
    emojis: string | string[]
  ): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const list = Array.isArray(emojis) ? emojis.map(String) : [String(emojis)];
    this._send(OpCode.ReactionSend, { gameId: cleanRoomId, messageId, reactions: list });
  }

  /**
   * Generates a new E2EE room, registers the key, joins it, and optionally sets its title.
   * @param {RoomTitle | string} [title] Optional room title.
   * @returns {Promise<Room>} The created Room instance.
   */
  public async createRoom(title?: RoomTitle | string): Promise<Room> {
    const { roomId, roomKey } = generateRoomAccessToken();
    this.registerRoomKey(roomId, roomKey);
    await this.joinRoom(roomId);

    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(this, { roomId, title: title || '', iconUrl: '', members: [] });
      this.rooms.set(roomId, room);
    }
    if (title) {
      await this.setRoomTitle(roomId, title);
    }
    return room;
  }
}
