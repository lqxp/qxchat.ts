/** Presence status modes. Mirrors `UserPresenceStatus` in lqxp/rust/src/models.rs. */
export enum PresenceStatus {
  Online = 'online',
  Invisible = 'invisible',
  DoNotDisturb = 'dnd',
}

/** Profile image type selector. */
export enum ProfileImageKind {
  Avatar = 'avatar',
  Banner = 'banner',
}

/** Recognized client platforms. */
export enum ClientPlatform {
  Web = 'web',
  Desktop = 'desktop',
  Android = 'android',
  IOS = 'ios',
  Mobile = 'mobile',
}

/** Options for client configuration. */
export interface ClientOptions {
  /** WebSocket Server URL. Defaults to 'wss://qxch.at/ws'. */
  wsUrl?: string;
  /** Platform identifier. Defaults to 'desktop'. */
  platform?: ClientPlatform | string;
  /** Unique client identifier. Defaults to auto-generated UUID. */
  clientId?: string;
  /** Custom client version tag. Defaults to 'qxchat.ts'. */
  version?: string;
  /** Automatic reconnection flag. Defaults to true. */
  autoReconnect?: boolean;
  /** Minimum reconnect delay backoff in ms. Defaults to 1000. */
  minReconnectDelay?: number;
  /** Maximum reconnect delay backoff in ms. Defaults to 30000. */
  maxReconnectDelay?: number;
  /** Optional Proxy URL (e.g. 'http://user:pass@proxy:8080') for native Bun fetch & WebSocket. */
  proxy?: string;
}
