/** Informations système renvoyées par la commande Rust `system_info`. */
export interface SystemInfo {
  model: string;
  memory: number;
  processor: string;
  cores: number;
  gpus: string[];
  diskTotal: number;
  firmware: string | null;
  osName: string;
  osBits: number | null;
  gnomeVersion: string | null;
  session: string | null;
  kernel: string | null;
  /** Logo de la distribution : source SVG, ou URL `data:` pour un PNG. */
  logo: string | null;
}
