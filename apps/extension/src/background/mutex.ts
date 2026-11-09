/**
 * Serializes async work. The service worker can receive several messages and tab events at once,
 * and each handler does a read-modify-write on the persisted session, so they must not interleave.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    // Keep the chain alive even if `task` rejects.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
