export type Danger = "low" | "medium" | "high";

export interface ConfigEntry {
  id: string;
  label: string;
  description: string;
  path: string;
  category: string;
  language: string;
  root: boolean;
  validate: string[] | null;
  danger: Danger;
}

export interface ConfigFile {
  id: string | null;
  label: string;
  description: string;
  path: string;
  category: string | null;
  language: string;
  root: boolean;
  validate: string[] | null;
  danger: Danger;
  content: string;
  size: number;
  readOnly: boolean;
}

export interface FavoriteEntry {
  path: string;
  label: string;
  root: boolean;
  language: string;
  added: number;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface DirListing {
  path: string;
  entries: DirEntry[];
}

export interface IndexStatus {
  ready: boolean;
  building: boolean;
  count: number;
}

export interface SearchResult {
  ready: boolean;
  building: boolean;
  items: string[];
}

export interface BackupEntry {
  id: string;
  created: number;
  size: number;
}
