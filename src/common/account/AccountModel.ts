export interface AccountModel {
  key: string;
  isBlobVersioningEnabled: boolean;
}

export function normalizeAccountName(accountName: string): string {
  return accountName.trim().toLowerCase();
}
