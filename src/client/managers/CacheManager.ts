import { Room } from '../../structures/Room';
import { Message } from '../../structures/Message';
import {
  validateRoomId,
  validateRoomTitle,
  validateRoomNote,
  type Username,
  type RoomId,
  type RoomTitle,
  type RoomNote,
} from '../../errors';
import { parseRoomAccessToken, decryptRoomPayload } from '../../crypto/e2ee';
import { type APIProfile, type PresenceStatus, type APIMessage, type APIAttachment, MessageKind } from '../../types';
import type { SelfbotClient } from '../SelfbotClient';
import { SNAPSHOT_VERSION } from '../../constants';

/**
 * Manages all in-memory caches for the connected client session.
 * Handles room metadata, encryption keys, user profiles, presence states,
 * and serializable snapshot import/export.
 *
 * Previously named `ClientCache`. Renamed for clarity.
 */
export class CacheManager {
  private _client: SelfbotClient;

  public readonly roomKeys = new Map<RoomId, string>();
  public readonly roomRatchets = new Map<RoomId, number>();
  public readonly rooms = new Map<RoomId, Room>();
  public readonly activeRoomsList: RoomId[] = [];
  public readonly roomNotes = new Map<RoomId, RoomNote>();
  public readonly usersByRoom = new Map<RoomId, Username[]>();
  public readonly profilesByUser = new Map<Username, APIProfile>();
  public readonly statusesByUser = new Map<Username, PresenceStatus>();
  public readonly badgesByUser = new Map<Username, string[]>();
  public badges: string[] = [];

  constructor(client: SelfbotClient) {
    this._client = client;
  }

  /**
   * Registers a 32-byte hex room key for a specific Room ID.
   * @param {RoomId | string} roomId The target room ID.
   * @param {string} roomKey The 32-byte hex room encryption key.
   */
  public registerRoomKey(roomId: RoomId | string, roomKey: string): void {
    const cleanRoomId = validateRoomId(roomId);
    this.roomKeys.set(cleanRoomId, roomKey);
  }

  /**
   * Registers an E2EE room token, parsing the Room ID and Room Key automatically.
   * @param {string} token The 96-char room access invite token.
   * @returns {RoomId} The parsed room ID.
   */
  public registerRoomToken(token: string): RoomId {
    const { roomId, roomKey } = parseRoomAccessToken(token);
    this.registerRoomKey(roomId, roomKey);
    return roomId;
  }

  /**
   * Decrypts and normalizes a raw server message into a Message instance.
   * @param {APIMessage} rawMessage Raw API message payload.
   * @param {RoomId | string} [fallbackRoomId] Room ID to use if not in the payload.
   * @returns {Promise<Message>} Resolved normalized Message.
   */
  public async decryptAndNormalizeMessage(
    rawMessage: APIMessage,
    fallbackRoomId?: RoomId | string
  ): Promise<Message> {
    const roomId = rawMessage.roomId || rawMessage.gameId || fallbackRoomId || '';
    const envelope = rawMessage.encrypted;

    if (!envelope) {
      return this._normalizeMessage(rawMessage, roomId, false);
    }

    const roomKey = this.roomKeys.get(roomId as RoomId);
    if (!roomKey) {
      return this._normalizeMessage(rawMessage, roomId as RoomId, true);
    }

    try {
      const decrypted = (await decryptRoomPayload(roomKey, roomId, envelope)) as {
        text?: string;
        attachment?: APIAttachment | null;
        replyToMessageId?: string | null;
      };
      return this._normalizeMessage(
        {
          ...rawMessage,
          text: decrypted?.text,
          attachment: decrypted?.attachment,
          replyToMessageId: decrypted?.replyToMessageId || rawMessage.replyToMessageId,
        },
        roomId,
        false
      );
    } catch {
      return this._normalizeMessage(rawMessage, roomId, true);
    }
  }

  /**
   * Normalizes a raw API message payload into a Message instance.
   * @param {APIMessage} message Raw API message payload.
   * @param {RoomId | string} fallbackRoomId Room ID to use if not in the payload.
   * @param {boolean} locked True if message decryption has failed.
   * @returns {Message} The initialized Message instance.
   */
  public _normalizeMessage(
    message: APIMessage,
    fallbackRoomId: RoomId | string,
    locked: boolean
  ): Message {
    const text = message.text || (locked ? 'Encrypted message' : '');
    const rawAttachment = message.attachment;
    const attachment = rawAttachment
      ? {
          id: String(rawAttachment.id || '').trim(),
          url: rawAttachment.url || '',
          filename: rawAttachment.filename || 'file',
          mimeType: rawAttachment.mimeType || 'application/octet-stream',
          size: Number(rawAttachment.size) || 0,
          dataB64: rawAttachment.dataB64 || '',
        }
      : null;

    let kind: MessageKind = MessageKind.Text;
    if (message.deleted) {
      kind = MessageKind.Deleted;
    } else if (attachment) {
      const mime = (attachment.mimeType || '').toLowerCase();
      if (mime.startsWith('audio/')) kind = MessageKind.Audio;
      else if (mime.startsWith('image/')) kind = MessageKind.Image;
      else if (mime.startsWith('video/')) kind = MessageKind.Video;
      else kind = MessageKind.File;
    }

    const username = message.username || message.user || 'Unknown';

    return new Message(this._client, {
      messageId: message.messageId,
      roomId: (message.roomId || message.gameId || fallbackRoomId) as RoomId,
      user: message.user || 'Unknown',
      username: username as Username,
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
   * Updates or creates a Room in cache from a gateway snapshot payload.
   * @param {unknown} d Gateway snapshot payload data object.
   * @returns {Room} The created or updated Room instance.
   */
  public updateRoomCache(d: unknown): Room {
    const data = d as Record<string, unknown>;
    const roomPayload = data.room as Record<string, unknown> | undefined;
    const roomId = String(
      roomPayload?.room_id || roomPayload?.roomId || data.gameId || ''
    ) as RoomId;

    if (!roomId) throw new Error('QXChat: Missing room ID in snapshot payload.');

    let room = this.rooms.get(roomId);

    // Preserve title if this is a title-preserving snapshot
    const title = String(roomPayload?.title || data.title || room?.title || roomId);

    const iconPayload = roomPayload?.icon as Record<string, unknown> | undefined;
    const filePayload = iconPayload?.file as Record<string, unknown> | undefined;
    const iconUrl = String(
      filePayload?.url || iconPayload?.url || roomPayload?.iconUrl || data.iconUrl || room?.iconUrl || ''
    );

    const rawMembers = roomPayload?.members;
    const members = Array.isArray(rawMembers)
      ? (rawMembers as Array<Record<string, unknown> | string>).map((m) =>
          typeof m === 'object' && m ? String(m.username || m.user || '') : String(m)
        )
      : (room?.members || []);

    const lastPreview = String(roomPayload?.lastPreview || room?.lastPreview || '');
    const lastTimestamp = Number(roomPayload?.lastTimestamp || room?.lastTimestamp || 0);
    const lastSender = String(roomPayload?.lastSender || room?.lastSender || '');

    if (room) {
      room.title = title as RoomTitle;
      room.iconUrl = iconUrl;
      room.members = members as Username[];
      room.lastPreview = lastPreview;
      room.lastTimestamp = lastTimestamp;
      room.lastSender = lastSender as Username;
    } else {
      room = new Room(this._client, {
        roomId,
        title,
        iconUrl,
        members,
        lastPreview,
        lastTimestamp,
        lastSender,
      });
      this.rooms.set(roomId, room);
    }

    if (!this.activeRoomsList.includes(roomId)) {
      this.activeRoomsList.push(roomId);
    }

    // Update per-room user list from `players` array
    if (Array.isArray(data.players)) {
      const players = (data.players as Array<Record<string, unknown> | string>).map((p) => {
        if (typeof p === 'object' && p) {
          const username = String(p.username || p.user || '').trim().toLowerCase() as Username;
          if (username && Array.isArray(p.badges)) {
            this.badgesByUser.set(username, p.badges.map(String));
          }
          return String(p.username || p.user || '') as Username;
        }
        return String(p) as Username;
      });
      this.usersByRoom.set(roomId, players);
    } else if (roomPayload) {
      this.usersByRoom.set(roomId, members as Username[]);
    }

    // Merge incoming profiles
    if (data.profiles && typeof data.profiles === 'object') {
      for (const [username, profile] of Object.entries(data.profiles as Record<string, unknown>)) {
        const key = username.trim().toLowerCase() as Username;
        if (key && profile && typeof profile === 'object') {
          const existing = this.profilesByUser.get(key) || {};
          this.profilesByUser.set(key, { ...existing, ...(profile as APIProfile) });
        }
      }
    }

    // Merge incoming statuses
    if (data.statuses && typeof data.statuses === 'object') {
      for (const [username, status] of Object.entries(data.statuses as Record<string, string>)) {
        const key = username.trim().toLowerCase() as Username;
        if (key && status) {
          this.statusesByUser.set(key, status as PresenceStatus);
        }
      }
    }

    // Sync own badges if present
    if (this._client.username) {
      const ownKey = this._client.username.trim().toLowerCase() as Username;
      const ownBadges = this.badgesByUser.get(ownKey);
      if (ownBadges) {
        this.badges = ownBadges;
      }
    }

    return room;
  }

  /**
   * Sets a local client-side note for a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {RoomNote | string} note Note text.
   */
  public setRoomNote(roomId: RoomId | string, note: RoomNote | string): void {
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
   * @param {RoomId | string} roomId Associated room ID.
   * @returns {RoomNote} Note text or empty string.
   */
  public getRoomNote(roomId: RoomId | string): RoomNote {
    const cleanRoomId = validateRoomId(roomId);
    return this.roomNotes.get(cleanRoomId) || ('' as RoomNote);
  }

  /**
   * Finds all rooms that both the current client and another user share.
   * @param {Username | string} username Target username.
   * @returns {Room[]} Shared room list.
   */
  public mutualRoomsWith(username: Username | string): Room[] {
    const target = username.trim().toLowerCase();
    const me = this._client.username.trim().toLowerCase();
    if (!target || !me) return [];

    const matches: Room[] = [];
    for (const room of this.rooms.values()) {
      const members = room.members.map((m) => m.trim().toLowerCase());
      if (members.includes(me) && members.includes(target)) {
        matches.push(room);
      }
    }
    return matches;
  }

  /**
   * Retrieves a user's profile metadata from cache.
   * @param {Username | string} username Target username.
   * @returns {APIProfile | null} API profile or null if not cached.
   */
  public getUserProfile(username: Username | string): APIProfile | null {
    const key = username.trim().toLowerCase() as Username;
    return this.profilesByUser.get(key) || null;
  }

  /**
   * Gets the member list cached for a room.
   * @param {RoomId | string} roomId Associated room ID.
   * @returns {Username[]} Username list.
   */
  public getRoomMembers(roomId: RoomId | string): Username[] {
    const cleanRoomId = validateRoomId(roomId);
    const room = this.rooms.get(cleanRoomId);
    if (room) return room.members;
    return this.usersByRoom.get(cleanRoomId) || [];
  }

  /**
   * Exports the full client session state as a JSON string.
   * Useful for saving session state and restoring it later.
   * @returns {string} Snapshot JSON string.
   */
  public exportSnapshot(): string {
    const snapshot = {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      username: this._client.username,
      status: this._client.status,
      rooms: Array.from(this.rooms.values()).map((r) => ({
        roomId: r.roomId,
        title: r.title,
        iconUrl: r.iconUrl,
        members: r.members,
        lastPreview: r.lastPreview,
        lastTimestamp: r.lastTimestamp,
        lastSender: r.lastSender,
      })),
      roomKeys: Array.from(this.roomKeys.entries()),
      roomRatchets: Array.from(this.roomRatchets.entries()),
      roomNotes: Array.from(this.roomNotes.entries()),
      deleteMessagesOnLeave: this._client.deleteMessagesOnLeave,
      serverClearsLocalMessages: this._client.serverClearsLocalMessages,
    };
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Restores client caches from a previously exported snapshot string.
   * @param {string} json Snapshot JSON string.
   */
  public importSnapshot(json: string): void {
    const data = JSON.parse(json) as Record<string, unknown>;

    if (data.username) this._client.username = data.username as Username;
    if (data.status) this._client.status = data.status as PresenceStatus;
    if (data.deleteMessagesOnLeave !== undefined) {
      this._client.deleteMessagesOnLeave = Boolean(data.deleteMessagesOnLeave);
    }
    if (data.serverClearsLocalMessages !== undefined) {
      this._client.serverClearsLocalMessages = Boolean(data.serverClearsLocalMessages);
    }

    if (Array.isArray(data.roomKeys)) {
      for (const [roomId, key] of data.roomKeys as Array<[string, string]>) {
        this.roomKeys.set(roomId as RoomId, key);
      }
    }
    if (Array.isArray(data.roomNotes)) {
      for (const [roomId, note] of data.roomNotes as Array<[string, string]>) {
        this.roomNotes.set(roomId as RoomId, note as RoomNote);
      }
    }
    if (Array.isArray(data.roomRatchets)) {
      for (const [roomId, ratchet] of data.roomRatchets as Array<[string, number]>) {
        this.roomRatchets.set(roomId as RoomId, ratchet);
      }
    }
    if (Array.isArray(data.rooms)) {
      for (const r of data.rooms as Array<Record<string, unknown>>) {
        const room = new Room(this._client, {
          roomId: String(r.roomId),
          title: String(r.title || ''),
          iconUrl: String(r.iconUrl || ''),
          members: Array.isArray(r.members) ? r.members.map(String) : [],
          lastPreview: String(r.lastPreview || ''),
          lastTimestamp: Number(r.lastTimestamp || 0),
          lastSender: String(r.lastSender || ''),
        });
        this.rooms.set(r.roomId as RoomId, room);
        if (!this.activeRoomsList.includes(r.roomId as RoomId)) {
          this.activeRoomsList.push(r.roomId as RoomId);
        }
      }
    }
  }
}

// Backward compatibility alias
export { CacheManager as ClientCache };
