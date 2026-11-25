export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  read: number;
  write: number;
}

export interface ProcessDetails {
  pid: number;
  parent: number | null;
  name: string;
  exe: string;
  cmd: string;
  cwd: string;
  status: string;
  startTime: number;
  runTime: number;
  cpu: number;
  memory: number;
  read: number;
  write: number;
  user: string;
  userId: string | null;
}

export type SortKey = "name" | "cpu" | "pid" | "memory" | "read" | "write";
