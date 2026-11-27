import { translate } from "@/core/i18n";

const PLAIN_CODES = [
  "config_not_found",
  "config_binary",
  "config_too_large",
  "config_path_denied",
  "config_backup_failed",
  "config_backup_not_found",
  "config_invalid_id",
  "config_favorites_failed",
  "config_invalid_root",
  "config_root_required",
  "pkexec_missing",
  "permission_denied",
  "unsupported_platform",
  "internal_error",
] as const;

const plain = new Set<string>(PLAIN_CODES);

/**
 * Traduit les codes d'erreur stables du backend. Le détail éventuel est séparé
 * du code par le premier `|` (voir `with_detail` côté Rust).
 */
export function formatConfigError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  const separator = message.indexOf("|");
  const code = separator === -1 ? message : message.slice(0, separator);
  const detail = separator === -1 ? "" : message.slice(separator + 1).trim();

  switch (code) {
    case "config_validation_failed":
      return translate("config.status.validationFailed", {
        detail: detail || translate("errors.config_validation_failed"),
      });
    case "config_write_failed":
      return translate("config.status.writeFailed", {
        detail: detail || translate("errors.config_write_failed"),
      });
    case "config_read_failed":
      return translate("config.status.readFailed", {
        detail: detail || translate("errors.config_read_failed"),
      });
    default:
      return plain.has(code) ? translate(`errors.${code}`) : message;
  }
}
