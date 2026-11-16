import { call } from "@/core/ipc";
import type { ProcessInfo } from "./types";

export const listProcesses = () => call<ProcessInfo[]>("list_processes");
