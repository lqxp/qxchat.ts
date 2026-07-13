import { sanitizeAndValidateUsername, validateRoomId, type Username, type RoomId } from '../../errors';
import { type APIProfile, type ProfileImageKind } from '../../types';
import type { BaseClient } from '../BaseClient';

/**
 * Handles all REST HTTP requests to the QXChat API.
 * All methods that require authentication throw if the client is not logged in.
 */
export class RestClient {
  private _client: BaseClient;

  constructor(client: BaseClient) {
    this._client = client;
  }

  /**
   * Derives the HTTP base URL from the WebSocket URL.
   * ws:// → http://, wss:// → https://, trims trailing /ws segment.
   * Centralized here to eliminate duplication.
   */
  private _getApiBase(): string {
    return this._client.options.wsUrl
      .replace(/^ws/, 'http')
      .replace(/\/ws$/, '');
  }

  /**
   * Asserts that the client is logged in; throws otherwise.
   */
  private _assertLoggedIn(): void {
    if (!this._client.authToken) {
      throw new Error('QXChat: Not logged in.');
    }
  }

  /**
   * Sends a JSON request to the QXChat REST API, authenticated with the current token.
   * @param {string} path Endpoint URI path (e.g. '/api/auth/me').
   * @param {RequestInit} [init] Standard fetch configuration.
   * @returns {Promise<Record<string, unknown>>} JSON response data.
   * @throws {Error} If fetch fails or response.ok is false.
   */
  public async apiRequest(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const res = await fetch(`${this._getApiBase()}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(this._client.authToken ? { authorization: `Bearer ${this._client.authToken}` } : {}),
        ...(init.headers as Record<string, string> | undefined ?? {}),
      },
      proxy: this._client.options.proxy || undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data?.ok === false) {
      throw new Error(String(data?.error ?? `HTTP ${res.status}`));
    }
    return data;
  }

  /**
   * Fetches a session token by logging in with username and password.
   * @param {string} username The QXChat account username.
   * @param {string} password The account password.
   * @param {string} [apiBaseUrl] Base API URL. Defaults to 'https://qxch.at'.
   * @param {string} [proxy] Optional proxy URL.
   * @returns {Promise<string>} The raw authentication token.
   * @throws {Error} If login fails or server returns invalid payload.
   */
  public static async fetchToken(
    username: string,
    password: string,
    apiBaseUrl = 'https://qxch.at',
    proxy?: string
  ): Promise<string> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      proxy: proxy || undefined,
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; error?: string; ok?: boolean };
    if (!res.ok || d?.ok === false) throw new Error(d?.error || `Auth failed: ${res.status}`);
    if (!d.token) throw new Error('Auth failed: No token returned');
    return d.token;
  }

  /**
   * Registers a new account and returns the session token.
   * @param {Username | string} username The desired account username.
   * @param {string} password The account password.
   * @param {string} [apiBaseUrl] Gateway base web server URL.
   * @param {string} [proxy] Optional proxy URL.
   * @returns {Promise<string>} Session token.
   * @throws {Error} If registration fails.
   */
  public static async register(
    username: Username | string,
    password: string,
    apiBaseUrl = 'https://qxch.at',
    proxy?: string
  ): Promise<string> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      proxy: proxy || undefined,
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Registration failed: ${res.status}`);
    if (!d.token) throw new Error('Registration failed: No token returned');
    return d.token;
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
  public static async recoverAccount(
    username: Username | string,
    recoveryWords: string,
    newPassword: string,
    apiBaseUrl = 'https://qxch.at',
    proxy?: string
  ): Promise<string> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/auth/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.trim().toLowerCase(), recoveryWords, newPassword }),
      proxy: proxy || undefined,
    });
    const d = (await res.json().catch(() => ({}))) as { token?: string; ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Recovery failed: ${res.status}`);
    if (!d.token) throw new Error('Recovery failed: No token returned');
    return d.token;
  }

  /**
   * Changes the username of the currently logged-in account.
   * @param {Username | string} newUsername Valid new username.
   * @returns {Promise<void>} Resolves when the name change succeeds.
   * @throws {Error} If not logged in or validation/request fails.
   */
  public async changeUsername(newUsername: Username | string): Promise<void> {
    this._assertLoggedIn();
    const clean = sanitizeAndValidateUsername(newUsername);
    const data = await this.apiRequest('/api/auth/username', {
      method: 'POST',
      body: JSON.stringify({ username: clean }),
    });
    const nextUsername = String((data.user as Record<string, unknown>)?.username ?? clean);
    this._client.username = nextUsername as Username;
  }

  /**
   * Permanently deletes the currently logged-in account.
   * Clears credentials but does NOT make an additional logout REST call.
   * @param {string} password The account password to confirm deletion.
   * @returns {Promise<void>} Resolves when account deletion completes.
   * @throws {Error} If not logged in or password check fails.
   */
  public async deleteAccount(password: string): Promise<void> {
    this._assertLoggedIn();
    await this.apiRequest('/api/auth/delete', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    // Clear credentials inline — do NOT call logoutAccount() (would make a second REST call)
    this._client.username = '' as Username;
    this._client.authToken = '';
    this._client.userId = '';
  }

  /**
   * Refreshes the session from the server, confirming the current token is still valid.
   * @returns {Promise<string>} The username from the refreshed session.
   * @throws {Error} If not logged in or session is invalid.
   */
  public async refreshSession(): Promise<string> {
    this._assertLoggedIn();
    const data = await this.apiRequest('/api/auth/me');
    const username = String((data.user as Record<string, unknown>)?.username ?? this._client.username);
    this._client.username = username as Username;
    return username;
  }

  /**
   * Logs out the user session from the server (revokes the token) and clears credentials.
   * @returns {Promise<void>} Resolves when logout completes.
   */
  public async logoutAccount(): Promise<void> {
    if (this._client.authToken) {
      try {
        await this.apiRequest('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore logout errors — proceed with credential cleanup regardless
      }
    }
    this._client.username = '' as Username;
    this._client.authToken = '';
    this._client.userId = '';
  }

  /**
   * Uploads a profile image (avatar or banner).
   * @param {ProfileImageKind | 'avatar' | 'banner'} kind Image type.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File binary buffer.
   * @param {string} [filename='image.png'] Optional name of file.
   * @returns {Promise<void>} Resolves when upload completes.
   * @throws {Error} If not logged in or upload fails.
   */
  public async uploadProfileImage(
    kind: ProfileImageKind | 'avatar' | 'banner',
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename = 'image.png'
  ): Promise<void> {
    this._assertLoggedIn();

    const form = new FormData();
    form.append('kind', kind);
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([fileBuffer]);
    form.append('file', blob, filename);

    const res = await fetch(`${this._getApiBase()}/api/profile/image`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this._client.authToken}` },
      body: form,
      proxy: this._client.options.proxy || undefined,
    });

    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || d?.ok === false) {
      throw new Error(d?.error || `Upload failed: ${res.status}`);
    }
  }

  /**
   * Uploads a room icon image.
   * @param {RoomId | string} roomId Associated room ID.
   * @param {Uint8Array | ArrayBuffer | Blob} fileBuffer File payload buffer.
   * @param {string} [filename='icon.png'] Optional name for the file.
   * @returns {Promise<string>} The new icon URL path.
   * @throws {Error} If not logged in, validation fails, or upload fails.
   */
  public async uploadRoomIcon(
    roomId: RoomId | string,
    fileBuffer: Uint8Array | ArrayBuffer | Blob,
    filename = 'icon.png'
  ): Promise<string> {
    this._assertLoggedIn();

    const cleanRoomId = validateRoomId(roomId);
    const form = new FormData();
    const blob = fileBuffer instanceof Blob ? fileBuffer : new Blob([fileBuffer]);
    form.append('file', blob, filename);

    const res = await fetch(`${this._getApiBase()}/api/rooms/${encodeURIComponent(cleanRoomId)}/icon`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this._client.authToken}` },
      body: form,
      proxy: this._client.options.proxy || undefined,
    });

    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      room?: { icon?: { url?: string; file?: { url?: string } } };
    };
    if (!res.ok || d?.ok === false) {
      throw new Error(d?.error || `Upload failed: ${res.status}`);
    }

    const url = d.room?.icon?.url || d.room?.icon?.file?.url || '';
    if (!url) throw new Error('Server did not return a valid room icon URL');
    return url;
  }

  /**
   * Loads the admin overview stats and lists. Requires admin status.
   * @returns {Promise<Record<string, unknown>>} Admin analytics payload.
   * @throws {Error} If account does not have admin privileges.
   */
  public async loadAdminOverview(): Promise<Record<string, unknown>> {
    if (!this._client.isAdmin) {
      throw new Error('QXChat Admin Error: Account does not have admin privileges.');
    }
    return this.apiRequest('/api/admin/overview');
  }

  /**
   * Toggles a global server feature. Requires admin status.
   * @param {string} key Feature code identifier.
   * @param {boolean} enabled Status flag.
   * @returns {Promise<Record<string, unknown>>} Action status response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminFeature(key: string, enabled: boolean): Promise<Record<string, unknown>> {
    if (!this._client.isAdmin) {
      throw new Error('QXChat Admin Error: Account does not have admin privileges.');
    }
    return this.apiRequest('/api/admin/features', {
      method: 'POST',
      body: JSON.stringify({ key, enabled: Boolean(enabled) }),
    });
  }

  /**
   * Disables or enables a user account. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {boolean} disabled Disables if true, enables if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminUserDisabled(userId: string, disabled: boolean): Promise<Record<string, unknown>> {
    if (!this._client.isAdmin) {
      throw new Error('QXChat Admin Error: Account does not have admin privileges.');
    }
    return this.apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/disabled`, {
      method: 'POST',
      body: JSON.stringify({ disabled: Boolean(disabled) }),
    });
  }

  /**
   * Bans or unbans a user account. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {boolean} banned Bans if true, unbans if false.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminUserBanned(userId: string, banned: boolean): Promise<Record<string, unknown>> {
    if (!this._client.isAdmin) {
      throw new Error('QXChat Admin Error: Account does not have admin privileges.');
    }
    return this.apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/banned`, {
      method: 'POST',
      body: JSON.stringify({ banned: Boolean(banned) }),
    });
  }

  /**
   * Sets user badges. Requires admin status.
   * @param {string} userId UUID of target user account.
   * @param {string[]} badges Badge identifiers to assign.
   * @returns {Promise<Record<string, unknown>>} Action response.
   * @throws {Error} If account does not have admin privileges.
   */
  public async setAdminUserBadges(userId: string, badges: string[]): Promise<Record<string, unknown>> {
    if (!this._client.isAdmin) {
      throw new Error('QXChat Admin Error: Account does not have admin privileges.');
    }
    return this.apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/badges`, {
      method: 'POST',
      body: JSON.stringify({ badges }),
    });
  }
}
