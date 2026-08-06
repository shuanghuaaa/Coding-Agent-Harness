import type { CredentialStore } from './store';

export class WinCredentialStore implements CredentialStore {
  private keytar: typeof import('keytar') | null = null;

  private async ensureKeytar(): Promise<typeof import('keytar')> {
    if (!this.keytar) {
      try {
        this.keytar = await import('keytar');
      } catch {
        throw new Error(
          'keytar is not available. On Windows, ensure the Visual C++ Redistributable is installed. ' +
          'Alternatively, set HARNESS_MASTER_PASSWORD and use AES file storage on non-Windows platforms.'
        );
      }
    }
    return this.keytar;
  }

  async get(service: string, account: string): Promise<string | null> {
    const keytar = await this.ensureKeytar();
    return keytar.getPassword(service, account);
  }

  async set(service: string, account: string, password: string): Promise<void> {
    const keytar = await this.ensureKeytar();
    await keytar.setPassword(service, account, password);
  }

  async delete(service: string, account: string): Promise<void> {
    const keytar = await this.ensureKeytar();
    await keytar.deletePassword(service, account);
  }
}