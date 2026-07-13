import { MessageBuilder } from '../builders/MessageBuilder';
import type { MessageData, Attachment, EncryptedEnvelope, MessageKind } from '../types/structures';
import type { Username, RoomId } from '../errors';
import { BaseStructure } from './BaseStructure';
import type { IActionClient } from './IActionClient';

/**
 * Represents a chat message in QXChat.
 * Extends BaseStructure for common serialization behavior.
 * Depends on IActionClient (not the full SelfbotClient) to avoid circular imports.
 */
export class Message extends BaseStructure<MessageData> {
  private readonly _client: IActionClient;

  public readonly messageId: string;
  public readonly roomId: RoomId;
  /** User UUID (internal server ID). */
  public readonly user: string;
  /** Display username. */
  public readonly username: Username;
  /** Decrypted (or plain) message text. */
  public text: string;
  /** Raw/encrypted text before processing. */
  public rawText: string;
  public readonly timestamp: number;
  public readonly system: boolean;
  public deleted: boolean;
  public reactions: string[];
  public readonly replyToMessageId: string;
  public readonly attachment: Attachment | null;
  public readonly encrypted: EncryptedEnvelope | null;
  public readonly preview: unknown;
  public readonly kind: MessageKind;
  public readonly voiceDuration: number | null;
  public readonly jumboEmoji: boolean;
  /** True if the message could not be decrypted (no key available). */
  public readonly locked: boolean;
  public editedAt: number;
  public readonly mentioned: boolean;

  /**
   * Creates a new Message instance.
   *
   * @param {IActionClient} client The active client (via IActionClient interface).
   * @param {MessageData} data Normalized message data.
   */
  constructor(client: IActionClient, data: MessageData) {
    super();
    this._client = client;
    this.messageId = data.messageId;
    this.roomId = data.roomId as RoomId;
    this.user = data.user;
    this.username = data.username as Username;
    this.text = data.text;
    this.rawText = data.rawText;
    this.timestamp = data.timestamp;
    this.system = data.system;
    this.deleted = data.deleted;
    this.reactions = data.reactions;
    this.replyToMessageId = data.replyToMessageId;
    this.attachment = data.attachment;
    this.encrypted = data.encrypted;
    this.preview = data.preview;
    this.kind = data.kind;
    this.voiceDuration = data.voiceDuration;
    this.jumboEmoji = data.jumboEmoji;
    this.locked = data.locked;
    this.editedAt = data.editedAt;
    this.mentioned = data.mentioned;
  }

  /**
   * Edits the text of this message. Works only if this user sent it.
   *
   * @param {string} content The new text content for the message.
   * @returns {Promise<void>} Resolves when the edit payload is sent.
   * @throws {Error} If permission or length checks fail.
   */
  public edit(content: string): Promise<void> {
    return this._client.editMessage(this.roomId, this.messageId, content);
  }

  /**
   * Deletes this message. Works if user sent it or has admin/mod privileges.
   *
   * @returns {Promise<void>} Resolves when the delete payload is sent.
   * @throws {Error} If action fails.
   */
  public delete(): Promise<void> {
    return this._client.deleteMessage(this.roomId, this.messageId);
  }

  /**
   * Replies to this message.
   *
   * @param {string | MessageBuilder} content Reply text body or MessageBuilder helper.
   * @returns {Promise<void>} Resolves when reply is sent.
   */
  public reply(content: string | MessageBuilder): Promise<void> {
    const builder = content instanceof MessageBuilder ? content : new MessageBuilder(content);
    builder.setReplyTo(this.messageId);
    return this._client.sendMessage(this.roomId, builder);
  }

  /**
   * Toggles a reaction emoji on this message.
   *
   * @param {string} emoji The target reaction emoji.
   * @returns {Promise<void>} Resolves when reaction packet is dispatched.
   */
  public react(emoji: string): Promise<void> {
    return this._client.toggleReaction(this.roomId, this.messageId, emoji);
  }

  /**
   * Serializes this message to a plain MessageData object.
   *
   * @returns {MessageData} Plain message data.
   */
  override toJSON(): MessageData {
    return {
      messageId: this.messageId,
      roomId: this.roomId,
      user: this.user,
      username: this.username,
      text: this.text,
      rawText: this.rawText,
      timestamp: this.timestamp,
      system: this.system,
      deleted: this.deleted,
      reactions: this.reactions,
      replyToMessageId: this.replyToMessageId,
      attachment: this.attachment,
      encrypted: this.encrypted,
      preview: this.preview,
      kind: this.kind,
      voiceDuration: this.voiceDuration,
      jumboEmoji: this.jumboEmoji,
      locked: this.locked,
      editedAt: this.editedAt,
      mentioned: this.mentioned,
    };
  }
}
