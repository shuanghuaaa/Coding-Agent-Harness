import type { CredentialStore } from './store';

export class WinCredentialStore implements CredentialStore {
  private keytar: typeof import('keytar') | null = null;
  private keytarUnavailable = false;
  private memory = new Map<string, string>();

  private memKey(service: string, account: string): string {
    return `${service}:${account}`;
  }

  private async ensureKeytar(): Promise<typeof import('keytar') | null> {
    if (this.keytarUnavailable) return null;
    if (!this.keytar) {
      try {
        this.keytar = await import('keytar');
      } catch {
        this.keytarUnavailable = true;
        return null;
      }
    }
    return this.keytar;
  }

  async get(service: string, account: string): Promise<string | null> {
    const keytar = await this.ensureKeytar();
    if (!keytar) {
      return this.memory.get(this.memKey(service, account)) ?? null;
    }
    return keytar.getPassword(service, account);
  }

  async set(service: string, account: string, password: string): Promise<void> {
    const keytar = await this.ensureKeytar();
    if (!keytar) {
      this.memory.set(this.memKey(service, account), password);
      return;
    }
    await keytar.setPassword(service, account, password);
  }

  async delete(service: string, account: string): Promise<void> {
    const keytar = await this.ensureKeytar();
    if (!keytar) {
      this.memory.delete(this.memKey(service, account));
      return;
    }
    await keytar.deletePassword(service, account);
  }
}
