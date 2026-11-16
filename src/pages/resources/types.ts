export interface ResourceSnapshot {
  cpuCores: number[];
  cpuGlobal: number;
  ramUsed: number;
  ramTotal: number;
  swapUsed: number;
  swapTotal: number;
  netRx: number;
  netTx: number;
  netRxTotal: number;
  netTxTotal: number;
  diskRead: number;
  diskWrite: number;
  diskReadTotal: number;
  diskWriteTotal: number;
}

/** Un point des courbes (une seconde). */
export interface ResourceSample {
  cpu: number[];
  ram: number;
  swap: number;
  rx: number;
  tx: number;
  read: number;
  write: number;
}
