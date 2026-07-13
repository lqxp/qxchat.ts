import { validateRoomTitle, validateRoomNote, type RoomTitle, type RoomNote } from '../errors';
import { BaseBuilder } from './BaseBuilder';

export interface RoomPayload {
  title: RoomTitle;
  note?: RoomNote;
}

/**
 * Fluent builder for room metadata operations.
 * Extends BaseBuilder to enforce the serialization contract.
 */
export class RoomBuilder extends BaseBuilder<RoomPayload> {
  private _title: RoomTitle = '' as RoomTitle;
  private _note: RoomNote | null = null;

  /**
   * Sets the title of the room.
   *
   * @param {string} text The new room title (Max 64 characters).
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If title exceeds room title limits.
   */
  setTitle(text: string): this {
    validateRoomTitle(text);
    this._title = text.trim() as RoomTitle;
    return this;
  }

  /**
   * Retrieves the current room title.
   *
   * @returns {RoomTitle} The room title.
   */
  get title(): RoomTitle {
    return this._title;
  }

  /**
   * Sets a local client-side note for the room.
   *
   * @param {string} text Note text (max 512 characters).
   * @returns {this} This builder instance for chaining.
   */
  setNote(text: string): this {
    validateRoomNote(text);
    this._note = text.trim() as RoomNote;
    return this;
  }

  /**
   * Retrieves the local note text.
   *
   * @returns {RoomNote | null} The note or null if not set.
   */
  get note(): RoomNote | null {
    return this._note;
  }

  /**
   * Serializes the room metadata to the server representation.
   *
   * @returns {RoomPayload} Serializable room payload.
   */
  override toJSON(): RoomPayload {
    const payload: RoomPayload = { title: this._title };
    if (this._note !== null) {
      payload.note = this._note;
    }
    return payload;
  }
}
