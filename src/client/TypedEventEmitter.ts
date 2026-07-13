export class TypedEventEmitter<Events extends Record<keyof Events, (...args: never[]) => unknown>> {
  private _listeners = new Map<keyof Events, Array<(...args: never[]) => unknown>>();

  /**
   * Registers a listener for the specified event.
   * @param event The event name.
   * @param listener The listener callback.
   * @returns Self.
   */
  public on<K extends keyof Events>(event: K, listener: Events[K]): this {
    let list = this._listeners.get(event);
    if (!list) {
      list = [];
      this._listeners.set(event, list);
    }
    list.push(listener as unknown as (...args: never[]) => unknown);
    return this;
  }

  /**
   * Registers a one-time listener for the specified event.
   * @param event The event name.
   * @param listener The listener callback.
   * @returns Self.
   */
  public once<K extends keyof Events>(event: K, listener: Events[K]): this {
    const onceWrapper = ((...args: Parameters<Events[K]>) => {
      this.off(event, onceWrapper);
      (listener as unknown as (...args: unknown[]) => void)(...args);
    }) as unknown as Events[K];
    return this.on(event, onceWrapper);
  }

  /**
   * Removes a listener from the specified event.
   * @param event The event name.
   * @param listener The listener callback to remove.
   * @returns Self.
   */
  public off<K extends keyof Events>(event: K, listener: Events[K]): this {
    const list = this._listeners.get(event);
    if (list) {
      const idx = list.indexOf(listener as unknown as (...args: never[]) => unknown);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
      if (list.length === 0) {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * Emits an event with the provided arguments to all registered listeners.
   * @param event The event name.
   * @param args The arguments to pass to the listeners.
   * @returns True if the event had listeners, false otherwise.
   */
  public emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): boolean {
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return false;

    const snapshot = list.slice();
    const len = snapshot.length;
    for (let i = 0; i < len; i++) {
      try {
        (snapshot[i] as unknown as (...args: unknown[]) => void)(...args);
      } catch {}
    }
    return true;
  }

  /**
   * Removes all listeners
   * @param event Optional event name.
   * @returns Self.
   */
  public removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}
