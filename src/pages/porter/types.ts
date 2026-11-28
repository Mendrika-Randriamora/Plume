export type PortProtocol = "tcp" | "udp";

export interface PortEntry {
  port: number;
  protocol: PortProtocol;
  address: string;
  remote: string;
  state: string;
  listening: boolean;
  pid: number | null;
  process: string | null;
  system: boolean;
}

export type StopStatus =
  | "stopped"
  | "permissionDenied"
  | "protected"
  | "notFound"
  | "timeout"
  | "unsupported"
  | "elevationCancelled"
  | "elevationUnavailable"
  | "failed";

export interface StopOutcome {
  status: StopStatus;
}

export type PortStatus = "free" | "busy" | "system";

export interface WatchedPort {
  port: number;
  /** Étiquette personnalisée ; null signifie « utiliser le nom du service courant ». */
  label: string | null;
}

export interface PorterConfig {
  watched: WatchedPort[];
  pinned: number[];
  includeOutgoing: boolean;
  filters: Record<PortStatus, boolean>;
}

export interface WatchedRow {
  watched: WatchedPort;
  entries: PortEntry[];
  status: PortStatus;
  representative: PortEntry | null;
  stoppable: PortEntry | null;
}

export interface StopTarget {
  pid: number;
  port: number;
  name: string;
}
