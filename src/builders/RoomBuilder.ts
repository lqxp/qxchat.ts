import { validateRoomTitle, type RoomTitle } from '@errors';

export interface RoomPayload {
  title: RoomTitle;
}

/**
 * Fluent builder for room metadata updates.
 */
export class RoomBuilder {
  private _title: RoomTitle = '' as RoomTitle;

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
   * Serializes the room metadata to the server representation.
   * 
   * @returns {RoomPayload} Serializable room payload.
   */
  toJSON(): RoomPayload {
    return {
      title: this._title,
    };
  }
}
