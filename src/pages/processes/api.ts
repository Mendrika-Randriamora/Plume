import { call } from "@/core/ipc";
import type { ProcessDetails, ProcessInfo } from "./types";

export const listProcesses = () => call<ProcessInfo[]>("list_processes");

export const processDetails = (pid: number) =>
  call<ProcessDetails>("process_details", { pid });

export const stopProcess = (pid: number) => call<void>("stop_process", { pid });

export const restartProcess = (pid: number) =>
  call<void>("restart_process", { pid });
