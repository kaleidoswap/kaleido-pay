import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import type { AttemptStore, SecretStore, SwapAttempt } from './attempt';

/** JSON files, one per attempt. For scripts and tests; the wallet uses its own storage. */
export class FileAttemptStore implements AttemptStore {
  constructor(private dir: string) {}
  async save(a: SwapAttempt) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(join(this.dir, `${a.id}.json`), JSON.stringify(a, null, 2));
  }
  async load(id: string) {
    try { return JSON.parse(await fs.readFile(join(this.dir, `${id}.json`), 'utf8')); } catch { return null; }
  }
  async list() {
    const names = await fs.readdir(this.dir).catch(() => [] as string[]);
    return Promise.all(names.filter(n => n.endsWith('.json')).map(n => fs.readFile(join(this.dir, n), 'utf8').then(JSON.parse)));
  }
}

/** One owner-only JSON file. Development only: the wallet must use Keychain / SecureStore. */
export class FileSecretStore implements SecretStore {
  constructor(private path: string) {}
  private async read(): Promise<Record<string, string>> {
    try { return JSON.parse(await fs.readFile(this.path, 'utf8')); } catch { return {}; }
  }
  async put(key: string, value: string) {
    const all = await this.read();
    all[key] = value;
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(all), { mode: 0o600 });
  }
  async get(key: string) {
    return (await this.read())[key] ?? null;
  }
}
