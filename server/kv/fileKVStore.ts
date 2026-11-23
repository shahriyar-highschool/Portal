import fs from 'fs';
import os from 'os';
import path from 'path';
import type { KVListResult, SchoolKVStore } from './kvStore.ts';

interface StoredEntry {
  value: string;
  expiresAt?: number;
}

function resolveDefaultKVPath(): string {
  if (process.env.KV_STORAGE_PATH) {
    return process.env.KV_STORAGE_PATH;
  }

  const isServerless = Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.VERCEL ||
      process.env.STORMKIT ||
      process.env.NETLIFY
  );

  if (isServerless) {
    return path.join(os.tmpdir(), 'shahriar-school-kv.json');
  }

  const localDataDir = path.resolve(process.cwd(), '.data');
  try {
    if (!fs.existsSync(localDataDir)) {
      fs.mkdirSync(localDataDir, { recursive: true });
    }
    fs.accessSync(localDataDir, fs.constants.W_OK);
    return path.join(localDataDir, 'school-kv.json');
  } catch {
    return path.join(os.tmpdir(), 'shahriar-school-kv.json');
  }
}

export class FileBackedKVStore implements SchoolKVStore {
  private filePath: string;
  private store: Map<string, StoredEntry> = new Map();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath?: string) {
    this.filePath = filePath ?? resolveDefaultKVPath();
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, StoredEntry>;
        const now = Date.now();
        for (const [key, entry] of Object.entries(parsed)) {
          if (!entry.expiresAt || entry.expiresAt > now) {
            this.store.set(key, entry);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load SCHOOL_KV file store:', err);
    }
  }

  private schedulePersist(): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          const dir = path.dirname(this.filePath);
          if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
          }
          const now = Date.now();
          const obj: Record<string, StoredEntry> = {};
          for (const [k, v] of this.store.entries()) {
            if (!v.expiresAt || v.expiresAt > now) {
              obj[k] = v;
            }
          }
          const tempPath = `${this.filePath}.tmp`;
          await fs.promises.writeFile(tempPath, JSON.stringify(obj, null, 2), 'utf-8');
          await fs.promises.rename(tempPath, this.filePath);
        } catch (err) {
          console.error('Failed to persist SCHOOL_KV file store:', err);
        }
      })
      .catch(() => {});
    return this.writeQueue;
  }

  async get(key: string): Promise<string | null>;
  async get(key: string, type: 'text'): Promise<string | null>;
  async get<T>(key: string, type: 'json'): Promise<T | null>;
  async get<T>(key: string, type?: 'text' | 'json'): Promise<string | T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      void this.schedulePersist();
      return null;
    }
    if (type === 'json') {
      try {
        return JSON.parse(entry.value) as T;
      } catch {
        return null;
      }
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
    await this.schedulePersist();
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    await this.schedulePersist();
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KVListResult> {
    const now = Date.now();
    const prefix = options?.prefix ?? '';
    const limit = options?.limit ?? 1000;
    const keys: Array<{ name: string; expiration?: number }> = [];

    for (const [name, entry] of this.store.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) continue;
      if (prefix && !name.startsWith(prefix)) continue;
      keys.push({
        name,
        expiration: entry.expiresAt ? Math.floor(entry.expiresAt / 1000) : undefined,
      });
      if (keys.length >= limit) break;
    }

    return {
      keys,
      list_complete: true,
    };
  }
}

let singletonStore: FileBackedKVStore | null = null;

export function getServerKVStore(): FileBackedKVStore {
  if (!singletonStore) {
    singletonStore = new FileBackedKVStore();
  }
  return singletonStore;
}
