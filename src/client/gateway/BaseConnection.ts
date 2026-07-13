import { TypedEventEmitter } from '../TypedEventEmitter';

export interface BaseConnectionEvents {
  open: () => void;
  message: (data: string | ArrayBuffer | Blob) => void;
  close: (event: CloseEvent) => void;
  error: (error: Event) => void;
}

/**
 * Base abstract class to manage a raw WebSocket connection.
 */
export abstract class BaseConnection<Events extends Record<keyof Events, (...args: never[]) => unknown> = BaseConnectionEvents> extends TypedEventEmitter<Events> {
  protected wsUrl: string;
  protected proxyUrl: string;
  public socket: WebSocket | null = null;
  public connected = false;

  constructor(wsUrl: string, proxyUrl = '') {
    super();
    this.wsUrl = wsUrl;
    this.proxyUrl = proxyUrl;
  }

  /**
   * Establishes the raw WebSocket connection.
   */
  public connect(): void {
    if (this.socket) return;

    try {
      if (this.proxyUrl) {
        this.socket = new WebSocket(this.wsUrl, {
          proxy: this.proxyUrl
        });
      } else {
        this.socket = new WebSocket(this.wsUrl);
      }
    } catch (err) {
      (this as TypedEventEmitter<BaseConnectionEvents>).emit('error', err as Event);
      return;
    }

    this.socket.addEventListener('open', () => {
      this.connected = true;
      (this as TypedEventEmitter<BaseConnectionEvents>).emit('open');
    });

    this.socket.addEventListener('message', ({ data }) => {
      (this as TypedEventEmitter<BaseConnectionEvents>).emit('message', data as string | ArrayBuffer | Blob);
    });

    this.socket.addEventListener('close', (event) => {
      this.connected = false;
      this.socket = null;
      (this as TypedEventEmitter<BaseConnectionEvents>).emit('close', event);
    });

    this.socket.addEventListener('error', (event) => {
      (this as TypedEventEmitter<BaseConnectionEvents>).emit('error', event);
    });
  }

  /**
   * Closes the active connection.
   */
  public disconnect(): void {
    if (this.socket) {
      if (this.socket.readyState < WebSocket.CLOSING) {
        this.socket.close();
      }
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Closes the connection (compatibility alias).
   */
  public close(): void {
    this.disconnect();
  }

  /**
   * Sends raw string/binary data over the WebSocket.
   * @param data The payload data.
   */
  public sendRaw(data: string | ArrayBuffer | Blob): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data as Parameters<WebSocket['send']>[0]);
    }
  }

  /**
   * Gets the current socket ready state.
   */
  public get readyState(): number {
    return this.socket ? this.socket.readyState : WebSocket.CLOSED;
  }
}
