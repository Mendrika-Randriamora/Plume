import { call } from "@/core/ipc";
import type {
  BackupEntry,
  ConfigEntry,
  ConfigFile,
  DirListing,
  FavoriteEntry,
  IndexStatus,
  SearchResult,
} from "./types";

/** Vrai uniquement sous Linux : le reste de la page est alors désactivé. */
export const configSupported = () => call<boolean>("config_supported");

export const listKnownConfigs = () => call<ConfigEntry[]>("list_known_configs");

export const readConfig = (path: string) => call<ConfigFile>("read_config", { path });

export const writeConfig = (path: string, content: string, root: boolean) =>
  call<void>("write_config", { path, content, root });

export const listDir = (path: string) => call<DirListing>("list_dir", { path });

export const startIndex = () => call<void>("start_index");

export const indexStatus = () => call<IndexStatus>("index_status");

export const searchConfigs = (query: string) => call<SearchResult>("search_configs", { query });

export const listBackups = (path: string) => call<BackupEntry[]>("list_backups", { path });

export const restoreBackup = (path: string, id: string) =>
  call<void>("restore_backup", { path, id });

/** Ouvre le sélecteur de fichiers natif ; `null` si l'utilisateur annule. */
export const openConfigFile = async (options?: { defaultPath?: string }): Promise<string | null> => {
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ title: "Plume", defaultPath: options?.defaultPath });
};

export const listFavorites = () => call<FavoriteEntry[]>("list_favorites");

export const addFavorite = (path: string) => call<FavoriteEntry>("add_favorite", { path });

export const removeFavorite = (path: string) => call<void>("remove_favorite", { path });
