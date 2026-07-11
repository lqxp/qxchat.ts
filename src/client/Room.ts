import type { SelfbotClient } from '@websocket';
import { MessageBuilder, RoomBuilder } from '@builders';
import { type Username, type RoomId, type RoomTitle, type RoomNote } from '@errors';

/**
 * Represents a chat room/channel in QXChat.
 */
export class Room {
  private readonly client: SelfbotClient;
  public readonly roomId: RoomId;
  public title: RoomTitle;
  public iconUrl: string;
  public members: Username[];
  public lastPreview: string;
  public lastTimestamp: number;
  public lastSender: Username;

  /**
   * Creates a Room instance.
   * 
   * @param {SelfbotClient} client The active client instance.
   * @param {RoomId} roomId The room ID.
   * @param {RoomTitle} [title] The room title.
   * @param {string} [iconUrl=''] The room icon URL.
   * @param {Username[]} [members=[]] Initial list of member usernames.
   * @param {string} [lastPreview=''] The last message text snippet.
   * @param {number} [lastTimestamp=0] Timestamp of last activity.
   * @param {Username} [lastSender] Username of last message sender.
   */
  constructor(
    client: SelfbotClient,
    roomId: RoomId,
    title: RoomTitle = '' as RoomTitle,
    iconUrl = '',
    members: Username[] = [],
    lastPreview = '',
    lastTimestamp = 0,
    lastSender: Username = '' as Username
  ) {
    this.client = client;
    this.roomId = roomId;
    this.title = title;
    this.iconUrl = iconUrl;
    this.members = members;
    this.lastPreview = lastPreview;
    this.lastTimestamp = lastTimestamp;
    this.lastSender = lastSender;
  }

  /**
   * Sends a message to this room.
   * 
   * @param {string | MessageBuilder} content Message text or MessageBuilder instance.
   * @returns {Promise<void>} Resolves when message has been encrypted and dispatched.
   */
  public async send(content: string | MessageBuilder): Promise<void> {
    return this.client.sendMessage(this.roomId, content);
  }

  /**
   * Sends typing status to this room.
   * 
   * @param {boolean} typing True to show typing, false to clear.
   * @returns {Promise<void>} Resolves when status is sent.
   */
  public async sendTyping(typing: boolean): Promise<void> {
    return this.client.sendTyping(this.roomId, typing);
  }

  /**
   * Leaves this room.
   * 
   * @returns {Promise<void>} Resolves when room leave payload is sent.
   */
  public async leave(): Promise<void> {
    return this.client.leaveRoom(this.roomId);
  }

  /**
   * Sets the title of this room.
   * 
   * @param {RoomTitle | RoomBuilder | string} title The new title string or RoomBuilder.
   * @returns {Promise<void>} Resolves when name updates.
   */
  public async setTitle(title: RoomTitle | RoomBuilder | string): Promise<void> {
    return this.client.setRoomTitle(this.roomId, title);
  }

  /**
   * Triggers history fetching for this room.
   * 
   * @returns {Promise<void>} Resolves when packet is sent.
   */
  public async fetchHistory(): Promise<void> {
    return this.client.fetchHistory(this.roomId);
  }

  /**
   * Generates a room access token (invite code) for this room.
   * The token encodes both the room ID and the E2EE room key.
   * 
   * @returns {string} 96-character invite token.
   * @throws {Error} If key is missing from client cache.
   */
  public createInvite(): string {
    const key = this.client.roomKeys.get(this.roomId);
    if (!key) throw new Error('No room key registered for this room');
    return `${this.roomId}${key}`;
  }

  /**
   * Uploads a new icon for this room.
   * 
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File payload buffer.
   * @param {string} [filename='icon.png'] Optional name for the file.
   * @returns {Promise<string>} The new icon URL path.
   * @throws {Error} If upload fails.
   */
  public async setIcon(fileBuffer: Uint8Array | ArrayBuffer | Blob, filename = 'icon.png'): Promise<string> {
    const url = await this.client.uploadRoomIcon(this.roomId, fileBuffer, filename);
    this.iconUrl = url;
    return url;
  }

  /**
   * Resets/clears the custom title of this room.
   * 
   * @returns {Promise<void>} Resolves when title is cleared.
   */
  public async clearTitle(): Promise<void> {
    return this.client.setRoomTitle(this.roomId, '' as RoomTitle);
  }

  /**
   * Sets a local client-side note for this room.
   * 
   * @param {RoomNote | string} note Note text.
   */
  public setNote(note: RoomNote | string): void {
    this.client.setRoomNote(this.roomId, note);
  }

  /**
   * Retrieves the local client-side note for this room.
   * 
   * @returns {RoomNote} Note text or empty string.
   */
  public getNote(): RoomNote {
    return this.client.getRoomNote(this.roomId);
  }
}
