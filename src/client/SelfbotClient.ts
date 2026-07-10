import { OpCode, PresenceStatus, MessageKind, ProfileImageKind, ClientPlatform, type GatewayPayload, type APIMessage, type HelloPayload, type APIAttachment, type ClientOptions, type ClientEvents } from '@types';
import { Room } from '@client/Room';
import { Message } from '@client/Message';
import { sanitizeAndValidateUsername, validateRoomId, validateRoomTitle, validateRoomNote } from '@errors';
import { parseRoomAccessToken, generateRoomAccessToken, encryptRoomPayload, decryptRoomPayload } from '@crypto';
import { MessageBuilder, ProfileBuilder, RoomBuilder } from '@builders';

class TypedEventEmitter<Events extends Record<keyof Events, (...args: never[]) => unknown>> {
  private _listeners = new Map<keyof Events, Set<(...args: never[]) => unknown>>();

  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener as unknown as (...args: never[]) => unknown);
    return this;
  }

  once<K extends keyof Events>(event: K, listener: Events[K]): this {
    const onceWrapper = ((...args: Parameters<Events[K]>) => {
      this.off(event, onceWrapper);
      (listener as unknown as (...args: unknown[]) => void)(...args);
    }) as unknown as Events[K];
    return this.on(event, onceWrapper);
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): this {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(listener as unknown as (...args: never[]) => unknown);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): boolean {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const listener of set) {
      try {
        (listener as unknown as (...args: unknown[]) => void)(...args);
      } catch (err) {
        console.error(`[QXChat.ts] Error in event listener for ${String(event)}:`, err);
      }
    }
    return true;
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}

/**
 * High-performance selfbot client for the QXChat protocol.
 */
export class SelfbotClient extends TypedEventEmitter<ClientEvents> {
  public readonly options: Required<ClientOptions>;
  public ws: WebSocket | null = null;

  // Connection states
  public connected = false;
  public identified = false;
  public userId = '';
  public username = '';
  public authToken = '';
  public status: PresenceStatus = PresenceStatus.Online;
  public deleteMessagesOnLeave = false;
  public serverClearsLocalMessages = false;

  // Backups and connection timings
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _manualClose = false;

  // Caching
  public readonly roomKeys = new Map<string, string>(); // roomId -> roomKey
  public readonly rooms = new Map<string, Room>();
  public readonly activeRoomsList: string[] = [];
  public readonly roomNotes = new Map<string, string>(); // roomId -> private note
  public readonly usersByRoom = new Map<string, string[]>(); // roomId -> usernames
  public readonly profilesByUser = new Map<string, Record<string, unknown>>(); // username -> raw profile
  public readonly statusesByUser = new Map<string, PresenceStatus>(); // username -> status
  public readonly badgesByUser = new Map<string, string[]>(); // username -> badges
  public badges: string[] = []; // own badges
  /** True if the current account has admin privileges. */
  public isAdmin = false;

  /**
   * Fetches a session token by logging in with username and password.
   * 
   * @param username The QXChat account username.
   * @param password The account password.
   * @param apiBaseUrl Base API url. Defaults to 'https://qxch.at/app'.
   * @returns The raw authentication token.
   */
  public static async fetchToken(
    username: string,
    password: string,
    apiBaseUrl = 'https://qxch.at'
  ): Promise<string> {
    const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        password
      })
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; error?: string; ok?: boolean };
    if (!res.ok || d?.ok === false) {
      throw new Error(d?.error || `Auth failed: ${res.status}`);
    }
    if (!d.token) {
      throw new Error("Auth failed: No token returned");
    }
    return d.token;
  }

  constructor(options: ClientOptions = {}) {
    super();
    this.options = {
      wsUrl: options.wsUrl || 'wss://qxch.at/ws',
      platform: options.platform || ClientPlatform.Desktop,
      clientId: options.clientId || crypto.randomUUID(),
      version: options.version || 'qxchat.ts',
      autoReconnect: options.autoReconnect !== false,
      minReconnectDelay: options.minReconnectDelay || 1000,
      maxReconnectDelay: options.maxReconnectDelay || 30000,
    };
    this._dnsPrefetch();
  }

  private _dnsPrefetch(): void {
    try {
      const hostingSource = new URL(this.options.wsUrl).hostname;
      if (typeof Bun !== 'undefined' && Bun.dns && typeof Bun.dns.prefetch === 'function') {
        Bun.dns.prefetch(hostingSource);
      }
    } catch {}
  }

  /**
   * Connects to the WebSocket gateway using the selfbot account details.
   * If only one parameter is provided, it is treated as the session token, and the username
   * will be automatically fetched from the QXChat REST API `/api/auth/me`.
   *
   * @param {string} tokenOrUsername Session token (if 1 arg) or username (if 2 args).
   * @param {string} [token] Raw authentication token (if 2 args).
   * @returns {Promise<void>} Resolves when the connection starts.
   * @throws {Error} If validation fails or fetching user profile fails.
   */
  public async login(tokenOrUsername: string, token?: string): Promise<void> {
    let activeUsername = '';
    let activeToken = '';

    if (token === undefined) {
      activeToken = tokenOrUsername.trim();
      if (!activeToken) throw new Error("QXChat: Authentication token is required.");

      const base = this.options.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const res = await fetch(`${base}/api/auth/me`, {
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${activeToken}`
        }
      });

      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { username?: string } };
      if (!res.ok || d?.ok === false) {
        throw new Error(d?.error || `Profile fetch failed during token-only login: HTTP ${res.status}`);
      }

      const fetched = d.user?.username || '';
      if (!fetched) {
        throw new Error("QXChat: Server did not return a valid username for the provided token.");
      }
      activeUsername = fetched;
    } else {
      activeUsername = tokenOrUsername;
      activeToken = token.trim();
      if (!activeToken) throw new Error("QXChat: Authentication token is required.");
    }

    const cleanUsername = sanitizeAndValidateUsername(activeUsername);
    this.username = cleanUsername;
    this.authToken = activeToken;
    this._manualClose = false;
    this._dnsPrefetch();
    this._connect();
  }

  /**
   * Disconnects the selfbot from the gateway.
   */
  public logout(): void {
    this._manualClose = true;
    this._stopHeartbeat();
    this._clearReconnectTimer();

    if (this.ws) {
      if (this.ws.readyState < WebSocket.CLOSING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.connected = false;
    this.identified = false;
    this.emit('disconnect', 'Manual logout called');
  }

  /**
   * Connection management
   */
  private _connect() {
    this._clearReconnectTimer();

    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.options.wsUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit('error', new Error(`Connection failed: ${msg}`));
      this._scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this._reconnectAttempts = 0;

      const isMobile = this.options.platform === ClientPlatform.Mobile ||
        this.options.platform === ClientPlatform.Android ||
        this.options.platform === ClientPlatform.IOS;

      // Send Identify payload
      this._send(OpCode.Identify, {
        username: this.username,
        token: this.authToken,
        isVoiceChat: false,
        deleteMessagesOnLeave: false,
        status: this.status,
        clientId: this.options.clientId,
        platform: this.options.platform,
        v: this.options.version,
        isMobile,
        isSecure: true
      });
    });

    this.ws.addEventListener('message', ({ data }) => {
      try {
        const payload = JSON.parse(data.toString());
        this._handlePayload(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit('error', new Error(`Malformed JSON payload received: ${msg}`));
      }
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.identified = false;
      this.ws = null;
      this._stopHeartbeat();

      if (!this._manualClose) {
        this.emit('disconnect', 'Gateway connection lost. Attempting reconnect...');
        this._scheduleReconnect();
      } else {
        this.emit('disconnect', 'Disconnected');
      }
    });

    this.ws.addEventListener('error', () => {
      this.emit('error', new Error('Gateway WebSocket error observed.'));
    });
  }

  private _scheduleReconnect() {
    if (!this.options.autoReconnect || this._manualClose || this._reconnectTimer) return;

    const minDelay = this.options.minReconnectDelay;
    const maxDelay = this.options.maxReconnectDelay;
    const delay = Math.min(maxDelay, minDelay * 2 ** Math.min(this._reconnectAttempts, 6));

    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
  }

  private _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _startHeartbeat(intervalMs: number) {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this._send(OpCode.Heartbeat, {});
      }
    }, intervalMs);
  }

  private _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  private _send(op: OpCode, d: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  /**
   * Processes gateway packets.
   */
  private async _handlePayload(payload: GatewayPayload) {
    const { op, d } = payload;
    if (!d || typeof d !== 'object') return;
    const data = d as Record<string, unknown>;

    switch (op) {
      case OpCode.Hello: {
        const hello = d as HelloPayload;
        if (hello?.heartbeat_interval) {
          this._startHeartbeat(hello.heartbeat_interval);
        }
        break;
      }
      case OpCode.Identify: {
        if (data.error) {
          this.emit('error', new Error(`Identify failed: ${String(data.error)}`));
          this.logout();
          break;
        }
        this.userId = String(data.id || data.userId || data.uuid || '');
        // Server may echo back username / admin flag in the ACK
        if (data.username) this.username = String(data.username);
        if (data.admin !== undefined) this.isAdmin = Boolean(data.admin);
        if (Array.isArray(data.badges)) {
          this.badges = data.badges.map(String);
          if (this.username) {
            this.badgesByUser.set(this.username.trim().toLowerCase(), this.badges);
          }
        }
        this.identified = true;
        this.emit('ready', this);
        break;
      }
      case OpCode.Message: {
        if (data.error) break;
        if (data.messageId && typeof data.timestamp === 'number') {
          const rawMsg = d as APIMessage;
          const msg = await this.decryptAndNormalizeMessage(rawMsg, rawMsg.roomId || rawMsg.gameId);
          this.emit('message', msg);
        }
        break;
      }
      case OpCode.MessageEdited: {
        if (data.messageId && typeof data.timestamp === 'number') {
          const rawMsg = d as APIMessage;
          const msg = await this.decryptAndNormalizeMessage(rawMsg, rawMsg.roomId || rawMsg.gameId);
          this.emit('messageUpdate', msg);
        }
        break;
      }
      case OpCode.MessageDeleted: {
        if (data.messageId && data.gameId) {
          this.emit('messageDelete', {
            roomId: String(data.gameId),
            messageId: String(data.messageId)
          });
        }
        break;
      }
      case OpCode.RoomMessagesDeleted: {
        if (data.gameId && Array.isArray(data.messageIds)) {
          this.emit('roomMessagesClear', {
            roomId: String(data.gameId),
            messageIds: (data.messageIds as unknown[]).map(String)
          });
        }
        break;
      }
      case OpCode.Join: {
        const roomPayload = data.room as Record<string, unknown> | undefined;
        const roomId = String(roomPayload?.room_id || roomPayload?.roomId || data.gameId || '');
        if (roomId) {
          const room = this._updateRoomCache(data);
          if (data.joined) {
            const username = String(data.joined);
            const currentUsers = this.usersByRoom.get(roomId) || [];
            if (!currentUsers.includes(username)) {
              currentUsers.push(username);
              this.usersByRoom.set(roomId, currentUsers);
              if (!room.members.includes(username)) {
                room.members.push(username);
              }
            }
            this.emit('userJoin', { roomId, username });
          } else if (data.ok && !data.system) {
            this.emit('roomUpdate', room);
          }
        }
        break;
      }
      case OpCode.Leave: {
        const roomPayload = data.room as Record<string, unknown> | undefined;
        const roomId = roomPayload?.room_id || roomPayload?.roomId || data.gameId;
        if (roomId) {
          const roomIdStr = String(roomId);
          if (data.ok) {
            this.rooms.delete(roomIdStr);
            const idx = this.activeRoomsList.indexOf(roomIdStr);
            if (idx !== -1) this.activeRoomsList.splice(idx, 1);
            this.usersByRoom.delete(roomIdStr);
          } else if (data.left) {
            const username = String(data.left);
            const currentUsers = this.usersByRoom.get(roomIdStr) || [];
            this.usersByRoom.set(roomIdStr, currentUsers.filter(u => u !== username));
            const room = this.rooms.get(roomIdStr);
            if (room) {
              room.members = room.members.filter(u => u !== username);
            }
            this.emit('userLeave', {
              roomId: roomIdStr,
              username
            });
          }
        }
        break;
      }
      case OpCode.Typing: {
        if (data.gameId && data.username) {
          const roomId = String(data.gameId);
          const username = String(data.username);
          if (data.typing) {
            this.emit('typingStart', { roomId, username });
          } else {
            this.emit('typingEnd', { roomId, username });
          }
        }
        break;
      }
      case OpCode.PresenceStatus: {
        if (data.user) {
          const username = String(data.user);
          const status = (String(data.status || 'online') as PresenceStatus) || PresenceStatus.Online;
          this.statusesByUser.set(username, status);
          if (data.profile) {
            const existing = this.profilesByUser.get(username) || {};
            this.profilesByUser.set(username, { ...existing, ...(data.profile as Record<string, unknown>) });
          }
          this.emit('presenceUpdate', {
            username,
            status
          });
        }
        break;
      }
      case OpCode.ProfileUpdate: {
        const user = String(data.user || '');
        if (user) {
          const incomingProfile = data.profile as Record<string, unknown> | undefined;
          if (incomingProfile) {
            const existing = this.profilesByUser.get(user) || {};
            this.profilesByUser.set(user, { ...existing, ...incomingProfile });
          }
          this._updateRoomCache(data);
          this.emit('profileUpdate', { username: user, profile: this.profilesByUser.get(user) || {} });
        }
        break;
      }
      case OpCode.RoomSnapshot:
      case OpCode.RoomSnapshotPreserveTitle: {
        const room = this._updateRoomCache(data);
        this.emit('roomUpdate', room);
        break;
      }
      case OpCode.ReactionSync: {
        if (data.messageId && data.gameId) {
          this.emit('messageReactionUpdate', {
            roomId: String(data.gameId),
            messageId: String(data.messageId),
            reactions: Array.isArray(data.reactions) ? data.reactions.map(String) : []
          });
        }
        break;
      }
      case OpCode.Error: {
        if (data.error) {
          this.emit('error', new Error(`Server Error: ${String(data.error)}`));
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Registers a 16-byte hex room key for a specific Room ID.
   */
  public registerRoomKey(roomId: string, roomKey: string): void {
    const cleanRoomId = validateRoomId(roomId);
    this.roomKeys.set(cleanRoomId, roomKey);
  }

  /**
   * Registers an E2EE room token, parsing the Room ID and Room Key automatically.
   */
  public registerRoomToken(token: string): string {
    const { roomId, roomKey } = parseRoomAccessToken(token);
    this.registerRoomKey(roomId, roomKey);
    return roomId;
  }

  /**
   * Cache managers
   */
  private _updateRoomCache(d: unknown): Room {
    const data = d as Record<string, unknown>;
    const roomPayload = data.room as Record<string, unknown> | undefined;
    const roomId = String(roomPayload?.room_id || roomPayload?.roomId || data.gameId || '');
    if (!roomId) throw new Error("QXChat: Missing room ID in snapshot.");

    let room = this.rooms.get(roomId);
    const title = String(roomPayload?.title || data.title || room?.title || roomId);

    const iconPayload = roomPayload?.icon as Record<string, unknown> | undefined;
    const filePayload = iconPayload?.file as Record<string, unknown> | undefined;
    const iconUrl = String(filePayload?.url || iconPayload?.url || roomPayload?.iconUrl || data.iconUrl || room?.iconUrl || '');

    const members = Array.isArray(roomPayload?.members)
      ? (roomPayload.members as Array<Record<string, unknown> | string>).map((m) =>
        typeof m === 'object' && m ? String(m.username || m.user || '') : String(m)
      )
      : room?.members || [];

    const lastPreview = String(roomPayload?.lastPreview || room?.lastPreview || '');
    const lastTimestamp = Number(roomPayload?.lastTimestamp || room?.lastTimestamp || 0);
    const lastSender = String(roomPayload?.lastSender || room?.lastSender || '');

    if (room) {
      room.title = title;
      room.iconUrl = iconUrl;
      room.members = members;
      room.lastPreview = lastPreview;
      room.lastTimestamp = lastTimestamp;
      room.lastSender = lastSender;
    } else {
      room = new Room(this, roomId, title, iconUrl, members, lastPreview, lastTimestamp, lastSender);
      this.rooms.set(roomId, room);
    }

    if (!this.activeRoomsList.includes(roomId)) {
      this.activeRoomsList.push(roomId);
    }

    if (Array.isArray(data.players)) {
      const players = (data.players as Array<Record<string, unknown> | string>).map(p => {
        if (typeof p === 'object' && p) {
          const username = String(p.username || p.user || '').trim().toLowerCase();
          if (username && Array.isArray(p.badges)) {
            this.badgesByUser.set(username, p.badges.map(String));
          }
          return String(p.username || p.user || '');
        }
        return String(p);
      });
      this.usersByRoom.set(roomId, players);
    } else if (roomPayload) {
      this.usersByRoom.set(roomId, members);
    }

    if (data.profiles && typeof data.profiles === 'object') {
      for (const [username, profile] of Object.entries(data.profiles as Record<string, unknown>)) {
        const key = username.trim().toLowerCase();
        if (key && profile && typeof profile === 'object') {
          const existing = this.profilesByUser.get(key) || {};
          this.profilesByUser.set(key, { ...existing, ...profile });
        }
      }
    }

    if (data.statuses && typeof data.statuses === 'object') {
      for (const [username, status] of Object.entries(data.statuses as Record<string, string>)) {
        const key = username.trim().toLowerCase();
        if (key && status) {
          this.statusesByUser.set(key, status as PresenceStatus);
        }
      }
    }

    if (this.username) {
      const ownBadges = this.badgesByUser.get(this.username.trim().toLowerCase());
      if (ownBadges) {
        this.badges = ownBadges;
      }
    }

    return room;
  }

  /**
   * Normalization + Decryption helper
   */
  public async decryptAndNormalizeMessage(rawMessage: APIMessage, fallbackRoomId?: string): Promise<Message> {
    const roomId = rawMessage.roomId || rawMessage.gameId || fallbackRoomId || '';
    const envelope = rawMessage.encrypted;

    if (!envelope) {
      return this._normalizeMessageRaw(rawMessage, roomId, false);
    }

    const roomKey = this.roomKeys.get(roomId);
    if (!roomKey) {
      return this._normalizeMessageRaw(rawMessage, roomId, true); // Retain encrypted placeholder
    }

    try {
      const decrypted = (await decryptRoomPayload(roomKey, roomId, envelope)) as { text?: string; attachment?: APIAttachment | null };
      return this._normalizeMessageRaw({
        ...rawMessage,
        text: decrypted?.text,
        attachment: decrypted?.attachment,
      }, roomId, false);
    } catch {
      return this._normalizeMessageRaw(rawMessage, roomId, true);
    }
  }

  private _normalizeMessageRaw(message: APIMessage, fallbackRoomId: string, locked: boolean): Message {
    const text = message.text || (locked ? 'Encrypted message' : '');
    const attachment = message.attachment ? {
      id: String(message.attachment.id || '').trim(),
      url: message.attachment.url || '',
      filename: message.attachment.filename || 'file',
      mimeType: message.attachment.mimeType || 'application/octet-stream',
      size: Number(message.attachment.size) || 0,
      dataB64: message.attachment.dataB64 || '',
    } : null;

    let kind: MessageKind = MessageKind.Text;
    if (message.deleted) kind = MessageKind.Deleted;
    else if (attachment) {
      const mime = (attachment.mimeType || '').toLowerCase();
      if (mime.startsWith('audio/')) kind = MessageKind.Audio;
      else if (mime.startsWith('image/')) kind = MessageKind.Image;
      else if (mime.startsWith('video/')) kind = MessageKind.Video;
      else kind = MessageKind.File;
    }

    const username = message.username || message.user || 'Unknown';

    return new Message(this, {
      messageId: message.messageId,
      roomId: message.roomId || message.gameId || fallbackRoomId,
      user: message.user || 'Unknown',
      username,
      text,
      rawText: text,
      timestamp: message.timestamp || Date.now(),
      system: Boolean(message.system),
      deleted: Boolean(message.deleted),
      reactions: Array.isArray(message.reactions) ? message.reactions : [],
      replyToMessageId: message.replyToMessageId || '',
      attachment,
      encrypted: message.encrypted || null,
      preview: message.preview || null,
      kind,
      voiceDuration: null,
      jumboEmoji: false,
      locked,
      editedAt: message.editedAt || 0,
      mentioned: Boolean(message.mentioned),
    });
  }


  /**
   * Joins a room using a token (derives E2EE key) or raw room ID.
   *
   * @param {string} tokenOrRoomId 64-char room access invite token or 32-char hex room ID.
   * @param {object} [options] Connection options.
   * @param {boolean} [options.silentJoin] True to join without broadcasting a presence packet.
   * @returns {Promise<void>} Resolves when the join message is dispatched.
   * @throws {Error} If ID format is invalid.
   */
  public async joinRoom(tokenOrRoomId: string, options?: { silentJoin?: boolean }): Promise<void> {
    let roomId = tokenOrRoomId;
    if (tokenOrRoomId.length === 64) {
      roomId = this.registerRoomToken(tokenOrRoomId);
    }

    validateRoomId(roomId);
    this._send(OpCode.Join, {
      gameId: roomId,
      silentJoin: options?.silentJoin === true
    });
  }

  /**
   * Leaves a room.
   *
   * @param {string} roomId The room ID.
   * @returns {Promise<void>} Resolves when the leave payload is dispatched.
   * @throws {Error} If roomId check fails.
   */
  public async leaveRoom(roomId: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.Leave, { gameId: cleanRoomId });
  }

  /**
   * Sends a message to a room. Automatically E2EE encrypts the message if a key is registered.
   *
   * @param {string} roomId The room ID.
   * @param {string | MessageBuilder} content Message body text or MessageBuilder instance.
   * @returns {Promise<void>} Resolves when message has been encrypted and sent.
   * @throws {Error} If validation fails or encryption fails.
   */
  public async sendMessage(roomId: string, content: string | MessageBuilder): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const builder = content instanceof MessageBuilder ? content : new MessageBuilder(content);
    const key = this.roomKeys.get(cleanRoomId);

    if (key) {
      const encrypted = await builder.toEncrypted(key, cleanRoomId);
      this._send(OpCode.Message, {
        text: '',
        gameId: cleanRoomId,
        encrypted,
        replyToMessageId: builder.replyToMessageId
      });
    } else {
      this._send(OpCode.Message, {
        text: builder.text,
        gameId: cleanRoomId,
        attachment: builder.attachment,
        replyToMessageId: builder.replyToMessageId
      });
    }
  }

  /**
   * Edits an existing message. Automatically E2EE encrypts if key is registered.
   *
   * @param {string} roomId The room ID containing the message.
   * @param {string} messageId UUID of the target message to edit.
   * @param {string} content The new text body.
   * @returns {Promise<void>} Resolves when the edit payload is sent.
   * @throws {Error} If validation fails.
   */
  public async editMessage(roomId: string, messageId: string, content: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const key = this.roomKeys.get(cleanRoomId);

    if (key) {
      const encrypted = await encryptRoomPayload(key, cleanRoomId, { text: content, attachment: null });
      this._send(OpCode.EditMessage, {
        messageId,
        gameId: cleanRoomId,
        text: '',
        encrypted
      });
    } else {
      this._send(OpCode.EditMessage, {
        messageId,
        gameId: cleanRoomId,
        text: content
      });
    }
  }

  /**
   * Deletes a message.
   *
   * @param {string} roomId The room ID containing the message.
   * @param {string} messageId UUID of the message to delete.
   * @returns {Promise<void>} Resolves when delete command is dispatched.
   * @throws {Error} If validation fails.
   */
  public async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.DeleteMessage, {
      messageId,
      gameId: cleanRoomId
    });
  }

  /**
   * Sends typing status indicator to a room.
   *
   * @param {string} roomId Associated room ID.
   * @param {boolean} typing True to show typing indicator, false to hide.
   * @returns {Promise<void>} Resolves when typing status packet is dispatched.
   * @throws {Error} If validation fails.
   */
  public async sendTyping(roomId: string, typing: boolean): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.Typing, {
      gameId: cleanRoomId,
      typing
    });
  }

  /**
   * Edits the room title (OpCode 33).
   *
   * @param {string} roomId Associated room ID.
   * @param {string | RoomBuilder} title New title string or RoomBuilder instance.
   * @returns {Promise<void>} Resolves when title update message is sent.
   * @throws {Error} If validation fails.
   */
  public async setRoomTitle(roomId: string, title: string | RoomBuilder): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    const cleanTitle = title instanceof RoomBuilder ? title.title : title;
    validateRoomTitle(cleanTitle);

    this._send(OpCode.RoomSnapshot, {
      gameId: cleanRoomId,
      title: cleanTitle
    });
  }

  /**
   * Fetches history of a room.
   *
   * @param {string} roomId Associated room ID.
   * @returns {Promise<void>} Resolves when request is sent.
   * @throws {Error} If validation fails.
   */
  public async fetchHistory(roomId: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.History, { gameId: cleanRoomId });
  }

  /**
   * Modifies account profile status details.
   *
   * @param {ProfileBuilder} profile Configured profile payload builder.
   * @returns {Promise<void>} Resolves when settings sync packet is sent.
   */
  public async updateProfile(profile: ProfileBuilder): Promise<void> {
    this._send(OpCode.SyncClientSettings, {
      status: this.status,
      deleteMessagesOnLeave: this.deleteMessagesOnLeave,
      serverClearsLocalMessages: this.serverClearsLocalMessages,
      clientId: this.options.clientId,
      platform: this.options.platform,
      profile: profile.toJSON()
    });
  }

  /**
   * Updates presence status (e.g. online, invisible, dnd).
   *
   * @param {PresenceStatus | 'online' | 'invisible' | 'dnd'} status Target presence state.
   * @param {ProfileBuilder} [profile] Optional profile updates builder.
   * @returns {Promise<void>} Resolves when status update packet is sent.
   */
  public async updatePresence(
    status: PresenceStatus | 'online' | 'invisible' | 'dnd',
    profile?: ProfileBuilder
  ): Promise<void> {
    this.status = status as PresenceStatus;
    this._send(OpCode.SyncClientSettings, {
      status,
      deleteMessagesOnLeave: this.deleteMessagesOnLeave,
      serverClearsLocalMessages: this.serverClearsLocalMessages,
      clientId: this.options.clientId,
      platform: this.options.platform,
      profile: profile ? profile.toJSON() : undefined
    });
  }

  /**
   * Toggles a reaction emoji on a message.
   *
   * @param {string} roomId Associated room ID.
   * @param {string} messageId Target message UUID.
   * @param {string} emoji Emoji character string to toggle.
   * @returns {Promise<void>} Resolves when reaction update packet is sent.
   * @throws {Error} If validation fails.
   */
  public async toggleReaction(roomId: string, messageId: string, emoji: string): Promise<void> {
    const cleanRoomId = validateRoomId(roomId);
    this._send(OpCode.ReactionSend, {
      messageId,
      reaction: emoji,
      gameId: cleanRoomId
    });
  }

  /**
   * Uploads a profile image (avatar or banner).
   *
   * @param {ProfileImageKind | 'avatar' | 'banner'} kind Image type.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File binary buffer.
   * @param {string} [filename='image.png'] Optional name of file.
   * @returns {Promise<void>} Resolves when upload completes.
   * @throws {Error} If not logged in or upload fails.
   */
  public async uploadProfileImage(
    kind: ProfileImageKind | 'avatar' | 'banner',
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename = 'image.png'
  ): Promise<void> {
    if (!this.authToken) throw new Error("QXChat: Not logged in.");

    const form = new FormData();
    form.append('kind', kind);
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([fileBuffer]);
    form.append('file', blob, filename);

    const base = this.options.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    const res = await fetch(`${base}/api/profile/image`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.authToken}` },
      body: form
    });

    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) {
      throw new Error(d?.error || `Upload failed: ${res.status}`);
    }
  }

  /**
   * Uploads a room icon image.
   *
   * @param {string} roomId Associated room ID.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File payload buffer.
   * @param {string} [filename='icon.png'] Optional name for the file.
   * @returns {Promise<string>} The new icon URL path.
   * @throws {Error} If not logged in, validation fails, or upload fails.
   */
  public async uploadRoomIcon(
    roomId: string,
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename = 'icon.png'
  ): Promise<string> {
    if (!this.authToken) throw new Error("QXChat: Not logged in.");

    const cleanRoomId = validateRoomId(roomId);
    const form = new FormData();
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([fileBuffer]);
    form.append('file', blob, filename);

    const base = this.options.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    const res = await fetch(`${base}/api/rooms/${encodeURIComponent(cleanRoomId)}/icon`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.authToken}` },
      body: form
    });

    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; room?: { icon?: { url?: string; file?: { url?: string } } } };
    if (!res.ok || d?.ok === false) {
      throw new Error(d?.error || `Upload failed: ${res.status}`);
    }

    const url = d.room?.icon?.url || d.room?.icon?.file?.url || '';
    if (!url) throw new Error("Server did not return a valid room icon URL");
    return url;
  }

  /**
   * Sends a JSON request to the QXChat REST API, authenticated with the current token.
   *
   * @param {string} path Endpoint URI path.
   * @param {RequestInit} [init] standard fetch configuration.
   * @returns {Promise<Record<string, unknown>>} JSON response data.
   * @throws {Error} If fetch fails or response.ok is false.
   */
  private async _apiRequest(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const base = this.options.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(this.authToken ? { 'authorization': `Bearer ${this.authToken}` } : {}),
        ...(init.headers as Record<string, string> | undefined ?? {})
      }
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data?.ok === false) {
      throw new Error(String(data?.error ?? `HTTP ${res.status}`));
    }
    return data;
  }

  /**
   * Registers a new account. Returns the session token.
   *
   * @param {string} username The desired account username.
   * @param {string} password The account password.
   * @param {string} [apiBaseUrl='https://qxch.at'] Gateway base web server URL.
   * @returns {Promise<string>} Session token.
   * @throws {Error} If registration fails.
   */
  public static async register(
    username: string,
    password: string,
    apiBaseUrl = 'https://qxch.at'
  ): Promise<string> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.trim().toLowerCase(), password })
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Registration failed: ${res.status}`);
    if (!d.token) throw new Error("Registration failed: No token returned");
    return d.token;
  }

  /**
   * Recovers an account using the recovery word list.
   *
   * @param {string} username The account username.
   * @param {string} recoveryWords The recovery phrase from account creation.
   * @param {string} newPassword The new password to set.
   * @param {string} [apiBaseUrl='https://qxch.at'] Gateway base web server URL.
   * @returns {Promise<string>} Session token.
   * @throws {Error} If recovery fails.
   */
  public static async recoverAccount(
    username: string,
    recoveryWords: string,
    newPassword: string,
    apiBaseUrl = 'https://qxch.at'
  ): Promise<string> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/auth/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        recoveryWords,
        newPassword
      })
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Recovery failed: ${res.status}`);
    if (!d.token) throw new Error("Recovery failed: No token returned");
    return d.token;
  }

  /**
   * Changes the username of the currently logged-in account.
   *
   * @param {string} newUsername Valid new username.
   * @returns {Promise<void>} Resolves when the name change succeeds.
   * @throws {Error} If not logged in or validation/request fails.
   */
  public async changeUsername(newUsername: string): Promise<void> {
    if (!this.authToken) throw new Error("QXChat: Not logged in.");
    const clean = sanitizeAndValidateUsername(newUsername);
    const data = await this._apiRequest('/api/auth/username', {
      method: 'POST',
      body: JSON.stringify({ username: clean })
    });
    const nextUsername = String((data.user as Record<string, unknown>)?.username ?? clean);
    this.username = nextUsername;
  }

  /**
   * Permanently deletes the currently logged-in account.
   * Disconnects after deletion.
   *
   * @param {string} password The account password to confirm deletion.
   * @returns {Promise<void>} Resolves when account deletion completes.
   * @throws {Error} If not logged in or password check fails.
   */
  public async deleteAccount(password: string): Promise<void> {
    if (!this.authToken) throw new Error("QXChat: Not logged in.");
    await this._apiRequest('/api/auth/delete', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    this.logout();
  }

  /**
   * Refreshes the session from the server, confirming the current token is still valid.
   *
   * @returns {Promise<string>} The username from the refreshed session.
   * @throws {Error} If not logged in or session is invalid.
   */
  public async refreshSession(): Promise<string> {
    if (!this.authToken) throw new Error("QXChat: Not logged in.");
    const data = await this._apiRequest('/api/auth/me');
    const username = String((data.user as Record<string, unknown>)?.username ?? this.username);
    this.username = username;
    return username;
  }

  /**
   * Logs out the user session from the server (revokes token) and cleans up client connection.
   * 
   * @returns {Promise<void>} Resolves when logout completes.
   */
  public async logoutAccount(): Promise<void> {
    if (this.authToken) {
      try {
        await this._apiRequest('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
    }
    this.logout();
  }

  /**
   * Generates a new E2EE room access token locally, registers the room key, joins it, and sets its title if provided.
   *
   * @param {string} [title] Optional room title.
   * @returns {Promise<Room>} The created room instance.
   * @throws {Error} If join or metadata set fails.
   */
  public async createRoom(title?: string): Promise<Room> {
    const { roomId, roomKey } = generateRoomAccessToken();
    this.registerRoomKey(roomId, roomKey);
    await this.joinRoom(roomId);

    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(this, roomId, title || '');
      this.rooms.set(roomId, room);
    }
    if (title) {
      await this.setRoomTitle(roomId, title);
    }
    return room;
  }

  /**
   * Sets a local client-side note for a room.
   *
   * @param {string} roomId Associated room ID.
   * @param {string} note Note content.
   * @throws {Error} If validation fails.
   */
  public setRoomNote(roomId: string, note: string): void {
    const cleanRoomId = validateRoomId(roomId);
    const cleanNote = validateRoomNote(note);
    if (cleanNote) {
      this.roomNotes.set(cleanRoomId, cleanNote);
    } else {
      this.roomNotes.delete(cleanRoomId);
    }
  }

  /**
   * Gets the local client-side note for a room.
   *
   * @param {string} roomId Associated room ID.
   * @returns {string} The cached note content or empty string.
   * @throws {Error} If validation fails.
   */
  public getRoomNote(roomId: string): string {
    const cleanRoomId = validateRoomId(roomId);
    return this.roomNotes.get(cleanRoomId) || '';
  }

  /**
   * Finds all rooms shared between the selfbot user and another user.
   *
   * @param {string} username The target username.
   * @returns {Room[]} Shared room instances array.
   */
  public mutualRoomsWith(username: string): Room[] {
    const target = username.trim().toLowerCase();
    const me = this.username.trim().toLowerCase();
    if (!target || !me) return [];

    const matches: Room[] = [];
    for (const room of this.rooms.values()) {
      const members = room.members.map(m => m.trim().toLowerCase());
      if (members.includes(me) && members.includes(target)) {
        matches.push(room);
      }
    }
    return matches;
  }

  /**
   * Retrieves the cached user profile for a user.
   *
   * @param {string} username The username.
   * @returns {Record<string, unknown> | null} The cached profile object or null.
   */
  public getUserProfile(username: string): Record<string, unknown> | null {
    const key = username.trim().toLowerCase();
    return this.profilesByUser.get(key) || null;
  }

  /**
   * Retrieves the list of cached members for a room.
   *
   * @param {string} roomId Associated room ID.
   * @returns {string[]} List of cached member usernames.
   * @throws {Error} If validation fails.
   */
  public getRoomMembers(roomId: string): string[] {
    const cleanRoomId = validateRoomId(roomId);
    const room = this.rooms.get(cleanRoomId);
    if (room) return room.members;
    return this.usersByRoom.get(cleanRoomId) || [];
  }

  /**
   * Exports a full JSON-serializable snapshot of the client state, including rooms, keys, and notes.
   *
   * @returns {string} JSON-serialized backup string.
   */
  public exportSnapshot(): string {
    const snapshot = {
      version: 4,
      exportedAt: new Date().toISOString(),
      username: this.username,
      status: this.status,
      rooms: Array.from(this.rooms.values()).map(r => ({
        roomId: r.roomId,
        title: r.title,
        iconUrl: r.iconUrl,
        members: r.members,
        lastPreview: r.lastPreview,
        lastTimestamp: r.lastTimestamp,
        lastSender: r.lastSender
      })),
      roomKeys: Array.from(this.roomKeys.entries()),
      roomNotes: Array.from(this.roomNotes.entries()),
      deleteMessagesOnLeave: this.deleteMessagesOnLeave,
      serverClearsLocalMessages: this.serverClearsLocalMessages
    };
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Imports a client snapshot, updating rooms, keys, and notes.
   *
   * @param {string} json Backup configuration string.
   * @throws {Error} If JSON parsing fails.
   */
  public importSnapshot(json: string): void {
    const data = JSON.parse(json);
    if (data.username) this.username = data.username;
    if (data.status) this.status = data.status;
    if (data.deleteMessagesOnLeave !== undefined) this.deleteMessagesOnLeave = data.deleteMessagesOnLeave;
    if (data.serverClearsLocalMessages !== undefined) this.serverClearsLocalMessages = data.serverClearsLocalMessages;

    if (Array.isArray(data.roomKeys)) {
      for (const [roomId, key] of data.roomKeys) {
        this.roomKeys.set(roomId, key);
      }
    }
    if (Array.isArray(data.roomNotes)) {
      for (const [roomId, note] of data.roomNotes) {
        this.roomNotes.set(roomId, note);
      }
    }
    if (Array.isArray(data.rooms)) {
      for (const r of data.rooms) {
        const room = new Room(
          this,
          r.roomId,
          r.title,
          r.iconUrl,
          r.members,
          r.lastPreview,
          r.lastTimestamp,
          r.lastSender
        );
        this.rooms.set(r.roomId, room);
        if (!this.activeRoomsList.includes(r.roomId)) {
          this.activeRoomsList.push(r.roomId);
        }
      }
    }
  }

  /**
   * Loads the admin overview stats and lists. Requires admin status.
   *
   * @returns {Promise<Record<string, unknown>>} Admin analytics payload.
   * @throws {Error} If account does not have admin privileges.
   */
  public async loadAdminOverview(): Promise<Record<string, unknown>> {
    if (!this.isAdmin) throw new Error("QXChat Admin Error: Account does not have admin privileges.");
    return this._apiRequest('/api/admin/overview');
  }

  /**
   * Toggles a global server feature. Requires admin status.
   *
   * @param {string} key Feature code identifier.
   * @param {boolean} enabled Status flag.
   * @returns {Promise<Record<string, unknown>>} Action status response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminFeature(key: string, enabled: boolean): Promise<Record<string, unknown>> {
    if (!this.isAdmin) throw new Error("QXChat Admin Error: Account does not have admin privileges.");
    return this._apiRequest('/api/admin/features', {
      method: 'POST',
      body: JSON.stringify({ key, enabled: Boolean(enabled) })
    });
  }

  /**
   * Disables or enables a user account. Requires admin status.
   *
   * @param {string} userId UUID of target user account.
   * @param {boolean} disabled Disables if true, enables if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminUserDisabled(userId: string, disabled: boolean): Promise<Record<string, unknown>> {
    if (!this.isAdmin) throw new Error("QXChat Admin Error: Account does not have admin privileges.");
    return this._apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/disabled`, {
      method: 'POST',
      body: JSON.stringify({ disabled: Boolean(disabled) })
    });
  }

  /**
   * Bans or unbans a user account. Requires admin status.
   *
   * @param {string} userId UUID of target user account.
   * @param {boolean} banned Bans if true, unbans if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminUserBanned(userId: string, banned: boolean): Promise<Record<string, unknown>> {
    if (!this.isAdmin) throw new Error("QXChat Admin Error: Account does not have admin privileges.");
    return this._apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/banned`, {
      method: 'POST',
      body: JSON.stringify({ banned: Boolean(banned) })
    });
  }
}

