import { call } from "@/core/ipc";

/** Une partition montée, interne ou externe. */
export interface Partition {
  device: string;
  mountPoint: string;
  fileSystem: string;
  kind: string;
  total: number;
  available: number;
  used: number;
  removable: boolean;
  readOnly: boolean;
}

export const listPartitions = () => call<Partition[]>("list_partitions");
