import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from "express-rate-limit";
import RedisStore, { type RedisReply } from "rate-limit-redis";

/**
 * What the store needs from Redis: whether it can take a command right now,
 * and a way to send one.
 */
export interface SharedCounter {
  ready(): boolean;
  call(...args: string[]): Promise<unknown>;
}

/**
 * A rate-limit store that counts in Redis while Redis is there, and in this
 * process's memory while it is not.
 *
 * Counting in Redis is what makes a limit hold across instances. But Redis is
 * the one dependency here that can vanish without the app being down: a free
 * hosted database gets reclaimed, a DNS name stops resolving. When that
 * happened the limiters had two behaviours and both were wrong. The general
 * one let every request through uncounted, after first waiting several seconds
 * for a connection that was never coming. The login one refused everybody.
 *
 * Counting locally is better than either. Every route stays limited, nobody is
 * locked out by a cache outage, and on a single instance the limit is exactly
 * as strict as it was. With several instances a client gets the allowance once
 * per instance until Redis returns, which is the honest cost and is logged.
 */
export class FallbackStore implements Store {
  readonly prefix: string;

  private readonly local = new MemoryStore();
  private shared: RedisStore | null = null;
  private options: Options | undefined;

  constructor(
    private readonly redis: SharedCounter | null,
    prefix: string,
    /** Told when a command to a connected Redis fails anyway. */
    private readonly onFailure: (error: unknown) => void = () => {}
  ) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.options = options;
    this.local.init(options);
  }

  /** Which store is counting at this moment. */
  get counting(): "shared" | "local" {
    return this.redis?.ready() ? "shared" : "local";
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.attempt(
      (store) => store.get(key),
      () => this.local.get(key)
    );
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    return this.attempt(
      (store) => store.increment(key),
      () => this.local.increment(key)
    );
  }

  async decrement(key: string): Promise<void> {
    return this.attempt(
      (store) => store.decrement(key),
      () => this.local.decrement(key)
    );
  }

  async resetKey(key: string): Promise<void> {
    // Whichever store counted this client, a reset has to clear it.
    await this.local.resetKey(key);
    await this.attempt(
      (store) => store.resetKey(key),
      async () => {}
    );
  }

  async resetAll(): Promise<void> {
    await this.local.resetAll();
  }

  shutdown(): void {
    this.local.shutdown();
  }

  /**
   * Runs against Redis when it is connected, and locally when it is not or
   * when the command fails. A request is never turned away, and never held
   * up, because the counter was unreachable.
   */
  private async attempt<T>(
    onShared: (store: RedisStore) => Promise<T>,
    onLocal: () => Promise<T>
  ): Promise<T> {
    const store = this.sharedStore();
    if (store) {
      try {
        return await onShared(store);
      } catch (error) {
        this.onFailure(error);
      }
    }
    return onLocal();
  }

  /**
   * The Redis store is built the first time Redis is actually reachable. Built
   * any earlier, its first act is to load two scripts into a server that is
   * not there.
   */
  private sharedStore(): RedisStore | null {
    const redis = this.redis;
    if (!redis || !this.options || !redis.ready()) return null;

    if (!this.shared) {
      const store = new RedisStore({
        prefix: this.prefix,
        sendCommand: (...args: string[]) => redis.call(...args) as Promise<RedisReply>,
      });
      // If loading the scripts fails here, the store loads them again on the
      // first count, so the failure only needs reporting.
      store.init(this.options).catch((error: unknown) => this.onFailure(error));
      this.shared = store;
    }

    return this.shared;
  }
}
