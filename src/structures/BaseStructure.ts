/**
 * Abstract base class for all rich model classes (Message, Room, User).
 * Provides a common serialization contract and type identity.
 *
 * @template T The serialized JSON output type.
 */
export abstract class BaseStructure<T extends object = Record<string, unknown>> {
  /**
   * Serializes this structure to a plain object.
   * Useful for logging, snapshots, and interoperability.
   */
  abstract toJSON(): T;

  /**
   * Returns a JSON string of this structure.
   */
  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}
