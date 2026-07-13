import {
  validatePronouns,
  validateProfileDescription,
  validateAvatarSize,
  validateBannerSize,
  type ProfileDescription,
  type Pronouns,
} from '../errors';
import { BaseBuilder } from './BaseBuilder';

export interface ProfileImagePayload {
  id?: string;
  url?: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  dataB64?: string;
}

export interface ProfilePayload {
  avatar: ProfileImagePayload | null;
  banner: ProfileImagePayload | null;
  description: ProfileDescription;
  pronouns: Pronouns;
}

/**
 * Fluent builder for user profile updates.
 * Extends BaseBuilder to enforce the serialization contract.
 */
export class ProfileBuilder extends BaseBuilder<ProfilePayload> {
  private _avatar: ProfileImagePayload | null = null;
  private _banner: ProfileImagePayload | null = null;
  private _description: ProfileDescription = '' as ProfileDescription;
  private _pronouns: Pronouns = '' as Pronouns;

  /**
   * Sets the profile bio description.
   *
   * @param {string} text Bio description text (Max 512 characters).
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If description exceeds limits.
   */
  setDescription(text: string): this {
    validateProfileDescription(text);
    this._description = text.trim() as ProfileDescription;
    return this;
  }

  /**
   * Sets the profile pronouns.
   *
   * @param {string} text Pronouns (Max 24 characters).
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If pronouns exceed limits.
   */
  setPronouns(text: string): this {
    validatePronouns(text);
    this._pronouns = text.trim() as Pronouns;
    return this;
  }

  /**
   * Configures the avatar image.
   *
   * @param {string} dataB64 Base64-encoded image data.
   * @param {string} mimeType MIME type (e.g. image/png, image/jpeg).
   * @param {number} [sizeBytes] Optional image size in bytes. If omitted, it is derived from base64.
   * @param {number} [width=0] Optional image width.
   * @param {number} [height=0] Optional image height.
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If avatar exceeds the 2MB limit.
   */
  setAvatar(
    dataB64: string,
    mimeType: string,
    sizeBytes?: number,
    width = 0,
    height = 0
  ): this {
    const rawB64 = dataB64.includes(',') ? dataB64.split(',')[1] ?? dataB64 : dataB64;
    const computedSize = sizeBytes ?? Math.floor((rawB64.length * 3) / 4);

    validateAvatarSize(computedSize);

    this._avatar = { mimeType, size: computedSize, width, height, dataB64: rawB64 };
    return this;
  }

  /**
   * Sets a remote URL as the avatar (e.g. when importing from a backup).
   *
   * @param {string} url Remote web URL.
   * @param {string} [mimeType='image/jpeg'] MIME type.
   * @param {string} [id] Optional file identifier.
   * @param {number} [width=0] Optional width.
   * @param {number} [height=0] Optional height.
   * @returns {this} This builder instance for chaining.
   */
  setRemoteAvatar(url: string, mimeType = 'image/jpeg', id?: string, width = 0, height = 0): this {
    this._avatar = { id: id || undefined, url, mimeType, size: 0, width, height };
    return this;
  }

  /**
   * Clears the current avatar configuration.
   *
   * @returns {this} This builder instance for chaining.
   */
  clearAvatar(): this {
    this._avatar = null;
    return this;
  }

  /**
   * Configures the profile banner image.
   *
   * @param {string} dataB64 Base64-encoded image data.
   * @param {string} mimeType MIME type (e.g. image/png, image/jpeg).
   * @param {number} [sizeBytes] Optional banner size in bytes. If omitted, derived from base64.
   * @param {number} [width=0] Optional banner width.
   * @param {number} [height=0] Optional banner height.
   * @returns {this} This builder instance for chaining.
   * @throws {Error} If banner exceeds the 5MB limit.
   */
  setBanner(
    dataB64: string,
    mimeType: string,
    sizeBytes?: number,
    width = 0,
    height = 0
  ): this {
    const rawB64 = dataB64.includes(',') ? dataB64.split(',')[1] ?? dataB64 : dataB64;
    const computedSize = sizeBytes ?? Math.floor((rawB64.length * 3) / 4);

    validateBannerSize(computedSize);

    this._banner = { mimeType, size: computedSize, width, height, dataB64: rawB64 };
    return this;
  }

  /**
   * Sets a remote URL as the banner image.
   *
   * @param {string} url Remote web URL.
   * @param {string} [mimeType='image/jpeg'] MIME type.
   * @param {string} [id] Optional file identifier.
   * @param {number} [width=0] Optional width.
   * @param {number} [height=0] Optional height.
   * @returns {this} This builder instance for chaining.
   */
  setRemoteBanner(url: string, mimeType = 'image/jpeg', id?: string, width = 0, height = 0): this {
    this._banner = { id: id || undefined, url, mimeType, size: 0, width, height };
    return this;
  }

  /**
   * Clears the current banner configuration.
   *
   * @returns {this} This builder instance for chaining.
   */
  clearBanner(): this {
    this._banner = null;
    return this;
  }

  /**
   * Serializes the profile configuration to the QXChat server payload representation.
   *
   * @returns {ProfilePayload} Serializable user profile updates payload.
   */
  override toJSON(): ProfilePayload {
    return {
      avatar: this._avatar,
      banner: this._banner,
      description: this._description,
      pronouns: this._pronouns,
    };
  }
}
