import { relaunch } from "@tauri-apps/plugin-process";
import { call } from "@/core/ipc";
import type { TitleBarMode } from "@/core/settings/store";

/** Lit le mode enregistré côté Rust, seule source vraie pour les décorations. */
export async function readTitleBarMode(): Promise<TitleBarMode> {
  const mode = await call<string>("title_bar_mode");
  return mode === "native" ? "native" : "custom";
}

/**
 * Enregistre le mode puis redémarre Plume : sous Wayland, GTK ne peut pas
 * ajouter ou retirer les décorations d'une fenêtre déjà créée.
 */
export async function applyTitleBarMode(mode: TitleBarMode): Promise<void> {
  await call("set_title_bar_mode", { mode });
  await relaunch();
}
