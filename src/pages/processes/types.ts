export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  read: number;
  write: number;
}

export type SortKey = "name" | "cpu" | "pid" | "memory" | "read" | "write";
