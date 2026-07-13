import { MessageBuilder } from '../builders/MessageBuilder';
import { RoomBuilder } from '../builders/RoomBuilder';
import type { RoomData } from '../types/structures';
import type { Username, RoomId, RoomTitle, RoomNote } from '../errors';
import { BaseStructure } from './BaseStructure';
import type { IActionClient } from './IActionClient';

/**
 * Represents a chat room/channel in QXChat.
 * Extends BaseStructure for common serialization behavior.
 * Depends on IActionClient (not the full SelfbotClient) to avoid circular imports.
 */
export class Room extends BaseStructure<RoomData> {
  private readonly _client: IActionClient;

  public readonly roomId: RoomId;
  public title: RoomTitle;
  public iconUrl: string;
  public members: Username[];
  public lastPreview: string;
  public lastTimestamp: number;
  public lastSender: Username;

  /**
   * Creates a Room instance from a data object.
   *
   * @param {IActionClient} client The active client instance.
   * @param {RoomData} data Normalized room data.
   */
  constructor(client: IActionClient, data: RoomData);

  /**
   * Creates a Room instance from positional parameters (backward-compatible overload).
   *
   * @param {IActionClient} client The active client instance.
   * @param {RoomId} roomId The room ID.
   * @param {RoomTitle} [title] The room title.
   * @param {string} [iconUrl] The room icon URL.
   * @param {Username[]} [members] Initial list of member usernames.
   * @param {string} [lastPreview] The last message text snippet.
   * @param {number} [lastTimestamp] Timestamp of last activity.
   * @param {Username} [lastSender] Username of last message sender.
   */
  constructor(
    client: IActionClient,
    roomId: RoomId,
    title?: RoomTitle,
    iconUrl?: string,
    members?: Username[],
    lastPreview?: string,
    lastTimestamp?: number,
    lastSender?: Username
  );

  constructor(
    client: IActionClient,
    roomIdOrData: RoomId | RoomData,
    title: RoomTitle = '' as RoomTitle,
    iconUrl = '',
    members: Username[] = [],
    lastPreview = '',
    lastTimestamp = 0,
    lastSender: Username = '' as Username
  ) {
    super();
    this._client = client;

    if (typeof roomIdOrData === 'object') {
      const d = roomIdOrData as RoomData;
      this.roomId = d.roomId as RoomId;
      this.title = (d.title || '') as RoomTitle;
      this.iconUrl = d.iconUrl || '';
      this.members = (d.members || []) as Username[];
      this.lastPreview = d.lastPreview || '';
      this.lastTimestamp = d.lastTimestamp || 0;
      this.lastSender = (d.lastSender || '') as Username;
    } else {
      this.roomId = roomIdOrData;
      this.title = title;
      this.iconUrl = iconUrl;
      this.members = members;
      this.lastPreview = lastPreview;
      this.lastTimestamp = lastTimestamp;
      this.lastSender = lastSender;
    }
  }

  /**
   * Sends a message to this room.
   *
   * @param {string | MessageBuilder} content Message text or MessageBuilder instance.
   * @returns {Promise<void>} Resolves when message has been encrypted and dispatched.
   */
  public send(content: string | MessageBuilder): Promise<void> {
    return this._client.sendMessage(this.roomId, content);
  }

  /**
   * Sends typing status to this room.
   *
   * @param {boolean} typing True to show typing, false to clear.
   * @returns {Promise<void>} Resolves when status is sent.
   */
  public sendTyping(typing: boolean): Promise<void> {
    return this._client.sendTyping(this.roomId, typing);
  }

  /**
   * Leaves this room.
   *
   * @returns {Promise<void>} Resolves when room leave payload is sent.
   */
  public leave(): Promise<void> {
    return this._client.leaveRoom(this.roomId);
  }

  /**
   * Sets the title of this room.
   *
   * @param {RoomTitle | RoomBuilder | string} title The new title string or RoomBuilder.
   * @returns {Promise<void>} Resolves when name updates.
   */
  public setTitle(title: RoomTitle | RoomBuilder | string): Promise<void> {
    return this._client.setRoomTitle(this.roomId, title);
  }

  /**
   * Resets/clears the custom title of this room.
   *
   * @returns {Promise<void>} Resolves when title is cleared.
   */
  public clearTitle(): Promise<void> {
    return this._client.setRoomTitle(this.roomId, '' as RoomTitle);
  }

  /**
   * Triggers history fetching for this room.
   *
   * @returns {Promise<void>} Resolves when packet is sent.
   */
  public fetchHistory(): Promise<void> {
    return this._client.fetchHistory(this.roomId);
  }

  /**
   * Generates a room access token (invite code) for this room.
   * The token encodes both the room ID and the E2EE room key.
   *
   * @returns {string} 96-character invite token.
   * @throws {Error} If key is missing from client cache.
   */
  public createInvite(): string {
    const key = this._client.roomKeys.get(this.roomId);
    if (!key) throw new Error('QXChat: No room key registered for this room.');
    return `${this.roomId}${key}`;
  }

  /**
   * Uploads a new icon for this room and updates the local iconUrl.
   *
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File payload buffer.
   * @param {string} [filename='icon.png'] Optional name for the file.
   * @returns {Promise<string>} The new icon URL path.
   * @throws {Error} If upload fails.
   */
  public async setIcon(fileBuffer: Uint8Array | ArrayBuffer | Blob, filename = 'icon.png'): Promise<string> {
    const url = await this._client.uploadRoomIcon(this.roomId, fileBuffer, filename);
    this.iconUrl = url;
    return url;
  }

  /**
   * Sets a local client-side note for this room.
   *
   * @param {RoomNote | string} note Note text.
   */
  public setNote(note: RoomNote | string): void {
    this._client.setRoomNote(this.roomId, note);
  }

  /**
   * Retrieves the local client-side note for this room.
   *
   * @returns {RoomNote} Note text or empty string.
   */
  public getNote(): RoomNote {
    return this._client.getRoomNote(this.roomId);
  }

  /**
   * Serializes this room to a plain RoomData object.
   *
   * @returns {RoomData} Plain room data.
   */
  override toJSON(): RoomData {
    return {
      roomId: this.roomId,
      title: this.title,
      iconUrl: this.iconUrl,
      members: this.members,
      lastPreview: this.lastPreview,
      lastTimestamp: this.lastTimestamp,
      lastSender: this.lastSender,
    };
  }
}
