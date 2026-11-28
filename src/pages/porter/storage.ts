import type { PorterConfig, PortStatus, WatchedPort } from "./types";

export const MAX_PINNED = 50;

/** Ports surveillés par défaut, dans l'ordre d'affichage. */
export const DEFAULT_WATCHED_PORTS: readonly number[] = [
  80, 443, 3000, 3001, 3306, 4200, 5000, 5173, 5432, 6379, 8000, 8080, 9000, 27017,
];

const KEY = "plume.porter.v1";

const defaultWatched = (): WatchedPort[] =>
  DEFAULT_WATCHED_PORTS.map((port) => ({ port, label: null }));

const validPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;

const fallback = (): PorterConfig => ({
  watched: defaultWatched(),
  pinned: [],
  includeOutgoing: false,
  filters: { free: true, busy: true, system: true },
});

/** Relit la configuration de la page, en ignorant les entrées invalides. */
export function loadConfig(): PorterConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback();

    const parsed = JSON.parse(raw) as Partial<PorterConfig> | null;
    if (!parsed || typeof parsed !== "object") return fallback();

    const watched = Array.isArray(parsed.watched)
      ? parsed.watched.reduce<WatchedPort[]>((result, item) => {
          if (!item || typeof item !== "object") return result;
          const port = (item as { port?: unknown }).port;
          if (!validPort(port) || result.some((entry) => entry.port === port)) return result;
          const rawLabel = (item as { label?: unknown }).label;
          const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel : null;
          result.push({ port, label });
          return result;
        }, [])
      : defaultWatched();

    const watchedPorts = new Set(watched.map((entry) => entry.port));
    const pinned = Array.isArray(parsed.pinned)
      ? parsed.pinned
          .filter((port): port is number => validPort(port) && watchedPorts.has(port))
          .filter((port, index, list) => list.indexOf(port) === index)
          .slice(0, MAX_PINNED)
      : [];

    const filters =
      parsed.filters && typeof parsed.filters === "object" ? parsed.filters : {};
    const enabled = (key: PortStatus) =>
      (filters as Partial<Record<PortStatus, unknown>>)[key] !== false;

    return {
      watched,
      pinned,
      includeOutgoing: parsed.includeOutgoing === true,
      filters: { free: enabled("free"), busy: enabled("busy"), system: enabled("system") },
    };
  } catch {
    return fallback();
  }
}

export function saveConfig(config: PorterConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* stockage indisponible : on ignore */
  }
}
