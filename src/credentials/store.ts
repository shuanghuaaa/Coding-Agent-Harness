export interface CredentialStore {
  set(service: string, account: string, password: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}