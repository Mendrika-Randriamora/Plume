export interface SystemStats {
  ramTotal: number;
  ramUsed: number;
  diskTotal: number;
  diskFree: number;
  temps: { cpu: number | null; gpu: number | null; ram: number | null };
  topApps: { name: string; memory: number }[];
}
export interface FileEntry {
  path: string;
  name: string;
  parent: string;
  isDir: boolean;
  size: number;
  lastUsed: number;
}
export interface Highlights {
  heavy: FileEntry[];
  unused: FileEntry[];
}
export interface ObsoleteInfo {
  manager: "apt" | "pacman" | "dnf" | "none";
  items: string[];
}
