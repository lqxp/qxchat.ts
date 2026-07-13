import type { APIProfile } from '../types/api';
import type { PresenceStatus } from '../types/options';
import type { Username } from '../errors';
import { BaseStructure } from './BaseStructure';

export interface UserData {
  username: Username;
  userId: string;
  profile: APIProfile;
  status: PresenceStatus;
  badges: string[];
}

/**
 * Represents a QXChat user with their profile metadata and presence state.
 * Extends BaseStructure for common serialization behavior.
 * Aggregates the scattered profile/status/badge data that was previously spread
 * across multiple Maps in CacheManager.
 */
export class User extends BaseStructure<UserData> {
  public readonly username: Username;
  public readonly userId: string;
  public profile: APIProfile;
  public status: PresenceStatus;
  public badges: string[];

  /**
   * Creates a new User instance.
   *
   * @param {UserData} data User data payload.
   */
  constructor(data: UserData) {
    super();
    this.username = data.username;
    this.userId = data.userId;
    this.profile = data.profile;
    this.status = data.status;
    this.badges = data.badges;
  }

  /**
   * Returns the display name, falling back to username if not set.
   *
   * @returns {string} Display name.
   */
  get displayName(): string {
    return this.profile.displayName || this.username;
  }

  /**
   * Returns the avatar URL, or an empty string if not set.
   *
   * @returns {string} Avatar URL.
   */
  get avatarUrl(): string {
    return this.profile.avatarUrl || '';
  }

  /**
   * Returns the banner URL, or an empty string if not set.
   *
   * @returns {string} Banner URL.
   */
  get bannerUrl(): string {
    return this.profile.bannerUrl || '';
  }

  /**
   * Returns the bio description, or an empty string if not set.
   *
   * @returns {string} Bio description.
   */
  get description(): string {
    return this.profile.description || '';
  }

  /**
   * Returns the pronouns string, or an empty string if not set.
   *
   * @returns {string} Pronouns.
   */
  get pronouns(): string {
    return this.profile.pronouns || '';
  }

  /**
   * Applies a partial profile update to this user.
   *
   * @param {Partial<APIProfile>} update Profile fields to merge.
   */
  public applyProfileUpdate(update: Partial<APIProfile>): void {
    this.profile = { ...this.profile, ...update };
  }

  /**
   * Serializes this user to a plain UserData object.
   *
   * @returns {UserData} Plain user data.
   */
  override toJSON(): UserData {
    return {
      username: this.username,
      userId: this.userId,
      profile: this.profile,
      status: this.status,
      badges: this.badges,
    };
  }
}
