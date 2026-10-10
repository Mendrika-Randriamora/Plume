import { invoke } from "@tauri-apps/api/core";

/** Appel d'une commande Rust, avec message d'erreur lisible. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error)?.message ?? "Erreur inconnue");
  }
}
