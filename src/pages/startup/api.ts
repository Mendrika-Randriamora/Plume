import { call } from "@/core/ipc";

export type StartupTrigger = "boot" | "schedule";

/** Une entrée de lancement automatique, relue depuis le système par Rust. */
export interface StartupEntry {
  id: string;
  name: string;
  command: string;
  trigger: StartupTrigger;
  schedule: string | null;
  enabled: boolean;
  /** Faux pour une entrée du système que Plume n'a pas créée : lecture seule. */
  managed: boolean;
  source: string;
}

export interface StartupList {
  autostartSupported: boolean;
  cronSupported: boolean;
  entries: StartupEntry[];
}

export interface StartupInput {
  name: string;
  command: string;
  /** `null` pour un lancement à l'ouverture de session, sinon une expression cron. */
  schedule: string | null;
}

export const listStartupEntries = () => call<StartupList>("list_startup_entries");

export const createStartupEntry = (name: string, command: string, schedule: string | null) =>
  call<void>("create_startup_entry", { name, command, schedule });

export const setStartupEntryEnabled = (id: string, enabled: boolean) =>
  call<void>("set_startup_entry_enabled", { id, enabled });

export const removeStartupEntry = (id: string) => call<void>("remove_startup_entry", { id });
