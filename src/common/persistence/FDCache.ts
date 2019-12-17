import { close } from "fs";
import { promisify } from "util";

import {
  DEFAULT_FD_CACHE_NUMBER,
  FD_CACHE_NUMBER_MAX,
  FD_CACHE_NUMBER_MIN
} from "../utils/constants";
import IFDCache from "./IFDCache";

const closeAsync = promisify(close);

export default class FDCache implements IFDCache {
  private initialized: boolean = false;
  private closed: boolean = false;

  private size: number;
  private queue: string[];
  private cache: Map<string, number>;

  public constructor(size: number = DEFAULT_FD_CACHE_NUMBER) {
    if (size < FD_CACHE_NUMBER_MIN || size > FD_CACHE_NUMBER_MAX) {
      size = DEFAULT_FD_CACHE_NUMBER;
    }
    this.size = size;
    this.queue = [];
    this.cache = new Map<string, number>();
  }

  /**
   * Init the FDCache.
   *
   * @returns {Promise<void>}
   * @memberof IFDCache
   */
  public async init(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Close FDCache, release the file descriptor.
   *
   * @returns {Promise<void>}
   * @memberof IFDCache
   */
  public async close(): Promise<void> {
    await this.clear();
    this.closed = true;
  }

  /**
   * Whether the fd has been initialized.
   *
   * @returns {boolean}
   * @memberof IFDCache
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Whether the fd has benn closed.
   *
   * @returns {boolean}
   * @memberof IFDCache
   */
  public isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get the fd with the given id.
   * Return -1 if the fd does not exist in the cache.
   *
   * @param {string} id
   * @returns {Promise<(number | undefined)>}
   * @memberof FDCache
   */
  public async get(id: string): Promise<number | undefined> {
    const fd = this.cache.get(id);
    return fd;
  }

  /**
   * Insert a new fd to the cache.
   * Replace an old item if the cache is full. The replaced FD should be closed.
   *
   * @param {string} id
   * @param {number} fd
   * @returns {Promise<void>}
   * @memberof IFDCache
   */
  public async insert(id: string, fd: number): Promise<void> {
    const count = this.queue.length;
    if (count === this.size) {
      const head = this.queue.shift();
      const cachedfd = this.cache.get(head!);
      if (cachedfd !== undefined) {
        this.cache.delete(head!);
        await closeAsync(cachedfd);
      }
    }
    this.queue.push(id);
    this.cache.set(id, fd);
  }

  public async clear(): Promise<void> {
    const closeFDPromises: Promise<void>[] = [];
    this.cache.forEach(fd => {
      closeFDPromises.push(closeAsync(fd));
    });
    await Promise.all(closeFDPromises);
    this.queue = [];
    this.cache.clear();
  }
}
