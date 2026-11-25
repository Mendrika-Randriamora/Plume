import { useSyncExternalStore } from "react";
import { resourceSnapshot } from "./api";
import type { ResourceSample, ResourceSnapshot } from "./types";

export interface ResourcesLive {
  latest: ResourceSnapshot | null;
  history: ResourceSample[];
  error: string | null;
}

const EMPTY: ResourcesLive = { latest: null, history: [], error: null };

let state = EMPTY;
let busy = false;
const listeners = new Set<() => void>();

function publish(next: ResourcesLive) {
  state = next;
  for (const listener of listeners) listener();
}

export const getResourcesLive = () => state;

export function subscribeResourcesLive(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Données de la page Ressources, alimentées en continu même quand elle est fermée. */
export function useResourcesLive(): ResourcesLive {
  return useSyncExternalStore(subscribeResourcesLive, getResourcesLive);
}

const share = (part: number, total: number) => (total ? (part / total) * 100 : 0);

const toSample = (s: ResourceSnapshot): ResourceSample => ({
  cpu: s.cpuCores,
  ram: share(s.ramUsed, s.ramTotal),
  swap: share(s.swapUsed, s.swapTotal),
  rx: s.netRx,
  tx: s.netTx,
  read: s.diskRead,
  write: s.diskWrite,
});

/**
 * Un relevé de plus. Appelé à intervalle régulier depuis l'application, pas
 * seulement depuis la page Ressources : à l'ouverture, les courbes sont déjà
 * complètes. Un appel précédent encore en cours est ignoré (pas d'empilement).
 * La taille de l'historique suit l'intervalle pour conserver une minute.
 */
export async function sampleResources(intervalMs = 1000) {
  if (busy) return;
  busy = true;
  try {
    const snapshot = await resourceSnapshot();
    const historySize = Math.max(6, Math.round(60_000 / intervalMs));
    publish({
      latest: snapshot,
      history: [...state.history, toSample(snapshot)].slice(-historySize),
      error: null,
    });
  } catch (e) {
    publish({ ...state, error: (e as Error).message });
  } finally {
    busy = false;
  }
}
