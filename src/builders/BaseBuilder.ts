/**
 *
 * @template T
 */
export abstract class BaseBuilder<T extends object = Record<string, unknown>> {

  /**
   * Serializes the builder configuration to a plain object
   * suitable for sending to the server.
   */
  abstract toJSON(): T;

  /**
   * Returns a JSON string representation of this builder.
   */
  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}
