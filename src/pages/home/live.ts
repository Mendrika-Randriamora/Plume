import { useSyncExternalStore } from "react";
import { homeHighlights, listObsolete, systemStats } from "./api";
import type { Highlights, ObsoleteInfo, SystemStats } from "./types";

/** Durée de validité de la liste des paquets obsolètes (longue à obtenir). */
const OBSOLETE_TTL = 5 * 60_000;

export interface HomeLive {
  stats: SystemStats | null;
  highlights: Highlights | null;
  scanning: boolean;
  obsolete: ObsoleteInfo | null;
  error: string | null;
}

const EMPTY: HomeLive = {
  stats: null,
  highlights: null,
  scanning: false,
  obsolete: null,
  error: null,
};

let state = EMPTY;
let statsBusy = false;
let scanBusy = false;
let obsoleteBusy = false;
let obsoleteAt = 0;
const listeners = new Set<() => void>();

function publish(patch: Partial<HomeLive>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const getHomeLive = () => state;

export function subscribeHomeLive(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Données de la page Accueil, alimentées en continu même quand elle est fermée. */
export function useHomeLive(): HomeLive {
  return useSyncExternalStore(subscribeHomeLive, getHomeLive);
}

/** Relevé régulier de la mémoire, du disque, des températures et des applications. */
export async function sampleHomeStats() {
  if (statsBusy) return;
  statsBusy = true;
  try {
    const stats = await systemStats();
    publish({ stats, error: null });
  } catch (e) {
    publish({ error: (e as Error).message });
  } finally {
    statsBusy = false;
  }
}

/**
 * Parcours du dossier personnel : coûteux, donc exécuté une seule fois puis
 * conservé en mémoire. `force` relance un scan (bouton d'actualisation).
 */
export async function loadHighlights(force = false) {
  if (scanBusy || (!force && state.highlights)) return;
  scanBusy = true;
  publish({ scanning: true });
  try {
    const highlights = await homeHighlights();
    publish({ highlights, error: null });
  } catch (e) {
    publish({ error: (e as Error).message });
  } finally {
    scanBusy = false;
    publish({ scanning: false });
  }
}

/** Paquets obsolètes, mis en cache quelques minutes pour ne pas relancer le gestionnaire. */
export async function loadObsolete(force = false) {
  if (obsoleteBusy) return;
  if (!force && state.obsolete && Date.now() - obsoleteAt < OBSOLETE_TTL) return;
  obsoleteBusy = true;
  try {
    const obsolete = await listObsolete();
    obsoleteAt = Date.now();
    publish({ obsolete, error: null });
  } catch (e) {
    publish({ error: (e as Error).message });
  } finally {
    obsoleteBusy = false;
  }
}
