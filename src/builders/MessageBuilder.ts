import { validateMessageText, validateAttachmentSize } from '@errors';
import { encryptRoomPayload } from '@crypto';
import type { APIAttachment, EncryptedEnvelope } from '@types';

/**
 * Fluent builder for constructing E2EE message payloads.
 */
export class MessageBuilder {
  private _text = '';
  private _replyToMessageId: string | null = null;
  private _attachment: APIAttachment | null = null;

  /**
   * Creates a new MessageBuilder.
   * 
   * @param {string} [initialText] Optional initial message text content.
   */
  constructor(initialText?: string) {
    if (initialText !== undefined) {
      this.setText(initialText);
    }
  }

  /**
   * Sets the text content of the message.
   *
   * @param {string} text The message body text (Max 2000 characters).
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If text length exceeds the message limit.
   */
  setText(text: string): this {
    validateMessageText(text);
    this._text = text;
    return this;
  }

  /**
   * Retrieves the current text content of the message.
   * 
   * @returns {string} The text content.
   */
  get text(): string {
    return this._text;
  }

  /**
   * Sets a message ID to reply to, creating a reply thread reference.
   *
   * @param {string | null} messageId The UUID of the target message to reply to.
   * @returns {this} This builder instance for chaining.
   */
  setReplyTo(messageId: string | null): this {
    this._replyToMessageId = messageId ? String(messageId).trim() : null;
    return this;
  }

  /**
   * Retrieves the reply message ID target.
   * 
   * @returns {string | null} The target message ID or null.
   */
  get replyToMessageId(): string | null {
    return this._replyToMessageId;
  }

  /**
   * Attaches a file/payload to the message.
   *
   * @param {string} filename Name of the file being uploaded (max 128 characters).
   * @param {string} dataB64 Base64-encoded file contents.
   * @param {string} [mimeType='application/octet-stream'] Optional MIME media type of the file.
   * @param {number} [sizeBytes] Size in bytes. If omitted, size will be calculated from the base64 string.
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If attachment size exceeds the 25MB limit.
   */
  setAttachment(
    filename: string,
    dataB64: string,
    mimeType = 'application/octet-stream',
    sizeBytes?: number
  ): this {
    const rawB64 = dataB64.includes(',') ? dataB64.split(',')[1] ?? dataB64 : dataB64;
    const computedSize = sizeBytes ?? Math.floor((rawB64.length * 3) / 4);

    validateAttachmentSize(computedSize);

    this._attachment = {
      id: crypto.randomUUID(),
      filename: filename.slice(0, 128),
      mimeType,
      size: computedSize,
      dataB64: rawB64,
    };
    return this;
  }

  /**
   * Clears any active attachment on this message.
   * 
   * @returns {this} This builder instance for chaining.
   */
  clearAttachment(): this {
    this._attachment = null;
    return this;
  }

  /**
   * Retrieves the active attachment config.
   * 
   * @returns {APIAttachment | null} The attachment or null.
   */
  get attachment(): APIAttachment | null {
    return this._attachment;
  }

  /**
   * Converts the builder configuration to a plain text representation.
   * 
   * @returns {{ text: string; attachment: APIAttachment | null }} Serializable object.
   */
  toJSON(): { text: string; attachment: APIAttachment | null } {
    return {
      text: this._text,
      attachment: this._attachment,
    };
  }

  /**
   * Encrypts the message body and attachments using AES-GCM for E2EE room messaging.
   *
   * @param {string} roomKey The 16-byte hex room key.
   * @param {string} roomId The room ID.
   * @returns {Promise<EncryptedEnvelope>} A promise resolving to the encrypted envelope.
   * @throws {Error} If verification or encryption fails.
   */
  async toEncrypted(roomKey: string, roomId: string): Promise<EncryptedEnvelope> {
    const payload = this.toJSON();
    return encryptRoomPayload(roomKey, roomId, payload);
  }
}
