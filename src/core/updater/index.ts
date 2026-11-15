import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Informations affichées à l'utilisateur quand une version plus récente existe. */
export interface AvailableUpdate {
  version: string;
  notes: string | null;
  date: string | null;
}

/** Pourcentage de téléchargement (0 à 100). */
export type ProgressHandler = (percent: number) => void;

/** Version de Plume actuellement installée, ou null hors de l'application. */
export async function getCurrentVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

/**
 * Vérifie l'adresse de mise à jour configurée dans tauri.conf.json.
 * Retourne null quand Plume est déjà à jour.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  requireApp();
  const update = await findUpdate();
  if (!update) return null;

  const info: AvailableUpdate = {
    version: update.version,
    notes: update.body?.trim() || null,
    date: update.date ?? null,
  };
  // Le paquet n'est pas téléchargé ici : on libère la ressource Rust associée.
  await update.close().catch(() => {});
  return info;
}

/**
 * Télécharge et installe la mise à jour, puis relance Plume.
 * N'appeler qu'après une validation explicite de l'utilisateur.
 */
export async function installUpdate(onProgress?: ProgressHandler): Promise<void> {
  requireApp();
  const update = await findUpdate();
  if (!update) throw new Error("Plume est déjà à jour : rien à installer.");

  try {
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (onProgress && total > 0) {
          onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
        }
      } else if (onProgress) {
        onProgress(100);
      }
    });
    await relaunch();
  } catch (e) {
    await update.close().catch(() => {});
    throw new Error(friendlyError(e));
  }
}

async function findUpdate() {
  try {
    return await check();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

function requireApp() {
  if (!isTauri()) {
    throw new Error("La mise à jour automatique n'est disponible que dans l'application Plume.");
  }
}

// Messages pensés pour un débutant : pas de code technique, pas de trace d'erreur.
const SIGNATURE = /signature|public key|pubkey|clé publique|base64/i;
const UNSUPPORTED = /appimage|not supported|unsupported/i;
const ENDPOINT = /endpoint/i;
const NOT_FOUND = /404|not found|release json|status code 4\d\d/i;
const TIMEOUT = /timeout|timed out|deadline/i;
const NETWORK = /dns|error sending request|connect|network|offline|unreachable|failed to fetch|tcp|tls/i;

function friendlyError(e: unknown): string {
  const raw = (typeof e === "string" ? e : (e as Error)?.message ?? "").trim();

  if (SIGNATURE.test(raw)) {
    return "La mise à jour n'a pas pu être vérifiée : sa signature est invalide. L'installation a été annulée par sécurité.";
  }
  if (UNSUPPORTED.test(raw)) {
    return "La mise à jour automatique n'est disponible que pour la version AppImage de Plume.";
  }
  if (ENDPOINT.test(raw)) {
    return "Aucune adresse de mise à jour n'est configurée. Contactez la personne qui développe Plume.";
  }
  if (NOT_FOUND.test(raw)) {
    return "Le serveur de mise à jour ne trouve pas de nouvelle version. Réessayez plus tard.";
  }
  if (TIMEOUT.test(raw)) {
    return "Le serveur de mise à jour met trop de temps à répondre. Vérifiez votre connexion puis réessayez.";
  }
  if (NETWORK.test(raw)) {
    return "Impossible de joindre le serveur de mise à jour. Vérifiez votre connexion Internet puis réessayez.";
  }
  return "Impossible de mettre à jour Plume pour le moment. Réessayez plus tard.";
}
