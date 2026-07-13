import { BaseConnection, type BaseConnectionEvents } from './BaseConnection';
import { OpCode, ClientPlatform, type GatewayPayload, type HelloPayload, Events } from '../../types';
import { PacketHandler } from './PacketHandler';
import type { SelfbotClient } from '../SelfbotClient';

export interface WebSocketManagerEvents extends BaseConnectionEvents {
  packet: (payload: GatewayPayload) => void;
}

/**
 * WebSocket manager for the QXChat protocol.
 * Handles connection lifecycle, heartbeat, reconnection, and packet routing.
 * Protocol parsing is delegated to PacketHandler.
 */
export class WebSocketManager extends BaseConnection<WebSocketManagerEvents> {
  private _client: SelfbotClient;
  private _handler: PacketHandler;
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _manualClose = false;
  private _ping = -1;
  private _lastHeartbeatSent: number | null = null;

  constructor(client: SelfbotClient) {
    super(client.options.wsUrl, client.options.proxy);
    this._client = client;
    this._handler = new PacketHandler(client);
    this._setupListeners();
  }

  /**
   * Current WebSocket ping latency in milliseconds.
   * Returns -1 if no heartbeat has been acknowledged yet.
   */
  public get ping(): number {
    return this._ping;
  }

  /**
   * Gets the WebSocket ping latency as a method call (alternate getter).
   */
  public getPing(): number {
    return this._ping;
  }

  /**
   * Closes the gateway connection (backward compatibility alias).
   */
  public override close(): void {
    this.disconnectGateway();
  }

  /**
   * Connects to the QXChat gateway.
   */
  public connectGateway(): void {
    this._manualClose = false;
    this.connect();
  }

  /**
   * Disconnects from the gateway gracefully.
   * @param {string} [reason] The close reason description.
   */
  public disconnectGateway(reason = 'Manual logout called'): void {
    this._manualClose = true;
    this._stopHeartbeat();
    this._clearReconnectTimer();
    this.disconnect();
    this._client.emit(Events.Disconnect, reason);
  }

  /**
   * Sends a structured JSON payload to the gateway.
   * @param {OpCode} op OpCode identifier.
   * @param {unknown} d Associated payload data.
   */
  public sendPayload(op: OpCode, d: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendRaw(JSON.stringify({ op, d }));
    }
  }

  private _setupListeners(): void {
    this.on('open', () => {
      this._reconnectAttempts = 0;
      this._clearReconnectTimer();

      const platform = this._client.options.platform;
      const isMobile =
        platform === ClientPlatform.Mobile ||
        platform === ClientPlatform.Android ||
        platform === ClientPlatform.IOS;

      this.sendPayload(OpCode.Identify, {
        username: this._client.username,
        token: this._client.authToken,
        isVoiceChat: false,
        deleteMessagesOnLeave: this._client.deleteMessagesOnLeave,
        status: this._client.status,
        clientId: this._client.options.clientId,
        platform,
        v: this._client.options.version,
        isMobile,
        isSecure: true,
      });
    });

    this.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString()) as GatewayPayload;
        void this._handleIncomingPayload(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this._client.emit(Events.Error, new Error(`Malformed JSON payload: ${msg}`));
      }
    });

    this.on('close', () => {
      this._stopHeartbeat();
      if (!this._manualClose) {
        this._client.emit(Events.Disconnect, 'Gateway connection lost. Reconnecting…');
        this._scheduleReconnect();
      } else {
        this._client.emit(Events.Disconnect, 'Disconnected');
      }
    });

    this.on('error', () => {
      this._client.emit(Events.Error, new Error('Gateway WebSocket error.'));
    });
  }

  private async _handleIncomingPayload(payload: GatewayPayload): Promise<void> {
    const { op, d } = payload;

    if (op === OpCode.Heartbeat || op === OpCode.Ack) {
      if (this._lastHeartbeatSent !== null) {
        this._ping = Math.round(performance.now() - this._lastHeartbeatSent);
        this._lastHeartbeatSent = null;
      }
    }

    if (op === OpCode.Hello) {
      const hello = d as HelloPayload;
      if (hello?.heartbeat_interval) {
        this._startHeartbeat(hello.heartbeat_interval);
      }
    }

    await this._handler.handle(payload);
  }

  private _startHeartbeat(intervalMs: number): void {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this._lastHeartbeatSent = performance.now();
        this.sendPayload(OpCode.Heartbeat, {});
      }
    }, intervalMs);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    this._lastHeartbeatSent = null;
  }

  private _scheduleReconnect(): void {
    if (!this._client.options.autoReconnect || this._manualClose || this._reconnectTimer) return;

    const minDelay = this._client.options.minReconnectDelay;
    const maxDelay = this._client.options.maxReconnectDelay;
    const delay = Math.min(maxDelay, minDelay * 2 ** Math.min(this._reconnectAttempts, 6));

    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
