import { useCallback, useEffect, useSyncExternalStore } from "react";
import { checkForUpdate, installUpdate, type AvailableUpdate } from "./index";
import { usePermission } from "@/core/settings/SettingsProvider";

export type UpdaterPhase = "idle" | "checking" | "latest" | "available" | "installing";

export interface UpdaterState {
  phase: UpdaterPhase;
  update: AvailableUpdate | null;
  progress: number;
  error: string | null;
}

/**
 * État partagé par le bandeau de démarrage et la section « Mise à jour de l'application » :
 * une seule vérification réseau, un seul téléchargement.
 */
let state: UpdaterState = { phase: "idle", update: null, progress: 0, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

let silentCheckDone = false;

/** Vérification au démarrage : silencieuse, n'affiche rien et ne bloque jamais l'interface. */
export async function checkSilently() {
  if (silentCheckDone) return;
  silentCheckDone = true;
  try {
    const found = await checkForUpdate();
    if (found) set({ phase: "available", update: found, error: null });
  } catch {
    /* hors-ligne ou serveur indisponible : l'utilisateur n'a rien demandé, on reste discret */
  }
}

/** Vérification demandée par l'utilisateur : les erreurs sont affichées. */
export async function checkNow() {
  set({ phase: "checking", error: null });
  try {
    const found = await checkForUpdate();
    set(found ? { phase: "available", update: found } : { phase: "latest", update: null });
  } catch (e) {
    set({ phase: "idle", update: null, error: (e as Error).message });
  }
}

/** Installation après validation explicite : téléchargement, installation, redémarrage. */
export async function installNow() {
  set({ phase: "installing", progress: 0, error: null });
  try {
    await installUpdate((progress) => set({ progress }));
    // En principe l'application redémarre avant d'arriver ici.
    set({ phase: "latest", update: null, progress: 100 });
  } catch (e) {
    set({ phase: "available", progress: 0, error: (e as Error).message });
  }
}

/**
 * Accès à l'état de mise à jour.
 * `autoCheck` lance la vérification silencieuse du démarrage (une seule fois par session).
 * Les vérifications et installations passent par l'autorisation `internetAccess` :
 * sans elle, Plume ne contacte pas le serveur de mise à jour.
 */
export function useAppUpdate(autoCheck = false) {
  const allowed = usePermission("internetAccess");
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (autoCheck && allowed) void checkSilently();
  }, [autoCheck, allowed]);

  const search = useCallback(async () => {
    if (!allowed) return;
    await checkNow();
  }, [allowed]);

  const install = useCallback(async () => {
    if (!allowed) return;
    await installNow();
  }, [allowed]);

  return { ...snapshot, allowed, search, install };
}
