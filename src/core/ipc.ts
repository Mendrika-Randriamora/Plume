import { invoke } from "@tauri-apps/api/core";
import { hasKey, translate } from "@/core/i18n";

/** Traduit un code d'erreur stable renvoyé par Rust, sans jamais afficher la clé brute. */
function translateError(raw: string): string {
  const code = raw.trim();
  if (!code) return translate("errors.unknown");

  const key = `errors.${code}`;
  if (hasKey(key)) return translate(key);

  // Ancien message brut (ou code inconnu) : on préfère un message générique.
  return code.startsWith("errors.") ? translate("errors.unknown") : code;
}

/** Appel d'une commande Rust, avec message d'erreur lisible. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const raw = typeof e === "string" ? e : (e as Error)?.message ?? "";
    throw new Error(translateError(raw));
  }
}
