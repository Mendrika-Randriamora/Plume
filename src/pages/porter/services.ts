import type { TranslationKey } from "@/core/i18n";

/** Étiquettes des services les plus courants, traduites dans la langue active. */
const SERVICE_KEYS: Record<number, TranslationKey> = {
  80: "porter.services.http",
  443: "porter.services.https",
  3000: "porter.services.react",
  3001: "porter.services.next",
  3306: "porter.services.mysql",
  4200: "porter.services.angular",
  5000: "porter.services.flask",
  5173: "porter.services.vite",
  5432: "porter.services.postgres",
  6379: "porter.services.redis",
  8000: "porter.services.django",
  8080: "porter.services.httpAlt",
  9000: "porter.services.phpFpm",
  27017: "porter.services.mongodb",
};

export function serviceKey(port: number): TranslationKey | null {
  return SERVICE_KEYS[port] ?? null;
}
