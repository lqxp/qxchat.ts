import type { SelfbotClient } from '@websocket';
import { MessageBuilder } from '@builders';
import { MessageKind, type Attachment, type EncryptedEnvelope } from '@types';

/**
 * Represents a chat message in QXChat.
 */
export class Message {
  private readonly client: SelfbotClient;
  public readonly messageId: string;
  public readonly roomId: string;
  public readonly user: string;
  public readonly username: string;
  public text: string;
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
  public readonly locked: boolean;
  public editedAt: number;
  public readonly mentioned: boolean;

  /**
   * Creates a new Message instance.
   * 
   * @param {SelfbotClient} client The active client.
   * @param {Omit<Message, 'client' | 'edit' | 'delete' | 'reply' | 'react'>} data Plain message data template.
   */
  constructor(client: SelfbotClient, data: Omit<Message, 'client' | 'edit' | 'delete' | 'reply' | 'react'>) {
    this.client = client;
    this.messageId = data.messageId;
    this.roomId = data.roomId;
    this.user = data.user;
    this.username = data.username;
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
  public async edit(content: string): Promise<void> {
    return this.client.editMessage(this.roomId, this.messageId, content);
  }

  /**
   * Deletes this message. Works if user sent it or has admin/mod privileges.
   * 
   * @returns {Promise<void>} Resolves when the delete payload is sent.
   * @throws {Error} If action fails.
   */
  public async delete(): Promise<void> {
    return this.client.deleteMessage(this.roomId, this.messageId);
  }

  /**
   * Replies to this message.
   * 
   * @param {string | MessageBuilder} content Reply text body or MessageBuilder helper.
   * @returns {Promise<void>} Resolves when reply is sent.
   */
  public async reply(content: string | MessageBuilder): Promise<void> {
    const builder = content instanceof MessageBuilder ? content : new MessageBuilder(content);
    builder.setReplyTo(this.messageId);
    return this.client.sendMessage(this.roomId, builder);
  }

  /**
   * Toggles a reaction emoji on this message.
   * 
   * @param {string} emoji The target reaction emoji.
   * @returns {Promise<void>} Resolves when reaction packet is dispatched.
   */
  public async react(emoji: string): Promise<void> {
    return this.client.toggleReaction(this.roomId, this.messageId, emoji);
  }
}
