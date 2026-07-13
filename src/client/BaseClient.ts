import { TypedEventEmitter } from './TypedEventEmitter';
import { RestClient } from './rest/RestClient';
import {
  ClientPlatform,
  type ClientOptions,
  type ClientEvents,
  type ProfileImageKind,
} from '../types';
import { type Username, type RoomId } from '../errors';
import {
  DEFAULT_WS_URL,
  DEFAULT_VERSION,
  DEFAULT_MIN_RECONNECT_DELAY,
  DEFAULT_MAX_RECONNECT_DELAY,
} from '../constants';

/**
 * Base client handling configuration, credentials, and HTTP REST requests.
 * Does not establish a WebSocket connection — use SelfbotClient for that.
 * Extend this class to implement custom client behavior.
 */
export class BaseClient extends TypedEventEmitter<ClientEvents> {
  public readonly options: Required<ClientOptions>;
  public readonly rest: RestClient;
  public username = '' as Username;
  public authToken = '';
  public userId = '';
  /** True if the current account has admin privileges on the QXChat server. */
  public isAdmin = false;


  /**
   * Fetches a session token by logging in with username and password.
   * @param {string} username The QXChat account username.
   * @param {string} password The account password.
   * @param {string} [apiBaseUrl] Base API URL. Defaults to 'https://qxch.at'.
   * @param {string} [proxy] Optional proxy URL.
   * @returns {Promise<string>} The raw authentication token.
   * @throws {Error} If login fails.
   */
  public static fetchToken(
    username: string,
    password: string,
    apiBaseUrl?: string,
    proxy?: string
  ): Promise<string> {
    return RestClient.fetchToken(username, password, apiBaseUrl, proxy);
  }

  /**
   * Registers a new account. Returns the session token.
   * @param {Username | string} username The desired account username.
   * @param {string} password The account password.
   * @param {string} [apiBaseUrl] Gateway base web server URL.
   * @param {string} [proxy] Optional proxy URL.
   * @returns {Promise<string>} Session token.
   * @throws {Error} If registration fails.
   */
  public static register(
    username: Username | string,
    password: string,
    apiBaseUrl?: string,
    proxy?: string
  ): Promise<string> {
    return RestClient.register(username, password, apiBaseUrl, proxy);
  }

  /**
   * Recovers an account using the recovery word list.
   * @param {Username | string} username The account username.
   * @param {string} recoveryWords The recovery phrase from account creation.
   * @param {string} newPassword The new password to set.
   * @param {string} [apiBaseUrl] Gateway base web server URL.
   * @param {string} [proxy] Optional proxy URL.
   * @returns {Promise<string>} Session token.
   * @throws {Error} If recovery fails.
   */
  public static recoverAccount(
    username: Username | string,
    recoveryWords: string,
    newPassword: string,
    apiBaseUrl?: string,
    proxy?: string
  ): Promise<string> {
    return RestClient.recoverAccount(username, recoveryWords, newPassword, apiBaseUrl, proxy);
  }


  constructor(options: ClientOptions = {}) {
    super();
    this.options = {
      wsUrl: options.wsUrl || DEFAULT_WS_URL,
      platform: options.platform || ClientPlatform.Desktop,
      clientId: options.clientId || crypto.randomUUID(),
      version: options.version || DEFAULT_VERSION,
      autoReconnect: options.autoReconnect !== false,
      minReconnectDelay: options.minReconnectDelay || DEFAULT_MIN_RECONNECT_DELAY,
      maxReconnectDelay: options.maxReconnectDelay || DEFAULT_MAX_RECONNECT_DELAY,
      proxy: options.proxy || '',
    };
    this.rest = new RestClient(this);
  }

  /**
   * Derives the HTTP base URL from the configured WebSocket URL.
   * Centralizes URL derivation that was previously duplicated in RestClient.
   */
  protected getApiBase(): string {
    return this.options.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
  }

  /**
   * Uploads a profile image (avatar or banner).
   * @param {ProfileImageKind | 'avatar' | 'banner'} kind Image type.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File binary buffer.
   * @param {string} [filename] Optional name of file.
   * @returns {Promise<void>} Resolves when upload completes.
   * @throws {Error} If not logged in or upload fails.
   */
  public uploadProfileImage(
    kind: ProfileImageKind | 'avatar' | 'banner',
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename?: string
  ): Promise<void> {
    return this.rest.uploadProfileImage(kind, fileBuffer, filename);
  }

  /**
   * Uploads a room icon image.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File payload buffer.
   * @param {string} [filename] Optional name for the file.
   * @returns {Promise<string>} The new icon URL path.
   * @throws {Error} If not logged in, validation fails, or upload fails.
   */
  public uploadRoomIcon(
    roomId: RoomId | string,
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename?: string
  ): Promise<string> {
    return this.rest.uploadRoomIcon(roomId, fileBuffer, filename);
  }

  /**
   * Changes the username of the currently logged-in account.
   * @param {Username | string} newUsername Valid new username.
   * @returns {Promise<void>} Resolves when the name change succeeds.
   * @throws {Error} If not logged in or validation/request fails.
   */
  public changeUsername(newUsername: Username | string): Promise<void> {
    return this.rest.changeUsername(newUsername);
  }

  /**
   * Permanently deletes the currently logged-in account.
   * @param {string} password The account password to confirm deletion.
   * @returns {Promise<void>} Resolves when account deletion completes.
   * @throws {Error} If not logged in or password check fails.
   */
  public deleteAccount(password: string): Promise<void> {
    return this.rest.deleteAccount(password);
  }

  /**
   * Refreshes the session from the server, confirming the current token is still valid.
   * @returns {Promise<string>} The username from the refreshed session.
   * @throws {Error} If not logged in or session is invalid.
   */
  public refreshSession(): Promise<string> {
    return this.rest.refreshSession();
  }

  /**
   * Logs out the user session from the server (revokes token) and clears credentials.
   * @returns {Promise<void>} Resolves when logout completes.
   */
  public logoutAccount(): Promise<void> {
    return this.rest.logoutAccount();
  }

  /**
   * Loads the admin overview stats and lists. Requires admin status.
   * @returns {Promise<Record<string, unknown>>} Admin analytics payload.
   * @throws {Error} If account does not have admin privileges.
   */
  public loadAdminOverview(): Promise<Record<string, unknown>> {
    return this.rest.loadAdminOverview();
  }

  /**
   * Toggles a global server feature. Requires admin status.
   * @param {string} key Feature code identifier.
   * @param {boolean} enabled Status flag.
   * @returns {Promise<Record<string, unknown>>} Action status response.
   * @throws {Error} If account does not have admin privileges.
   */
  public setAdminFeature(key: string, enabled: boolean): Promise<Record<string, unknown>> {
    return this.rest.setAdminFeature(key, enabled);
  }

  /**
   * Disables or enables a user account. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {boolean} disabled Disables if true, enables if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public setAdminUserDisabled(userId: string, disabled: boolean): Promise<Record<string, unknown>> {
    return this.rest.setAdminUserDisabled(userId, disabled);
  }

  /**
   * Bans or unbans a user account. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {boolean} banned Bans if true, unbans if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public setAdminUserBanned(userId: string, banned: boolean): Promise<Record<string, unknown>> {
    return this.rest.setAdminUserBanned(userId, banned);
  }

  /**
   * Sets user badges. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {string[]} badges Badge identifiers to assign.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public setAdminUserBadges(userId: string, badges: string[]): Promise<Record<string, unknown>> {
    return this.rest.setAdminUserBadges(userId, badges);
  }
}
