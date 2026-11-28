import { call } from "@/core/ipc";
import type { PortEntry, StopOutcome } from "./types";

export const listPorts = (includeOutgoing: boolean) =>
  call<PortEntry[]>("list_ports", { includeOutgoing });

export const stopPortProcess = (pid: number, elevate: boolean) =>
  call<StopOutcome>("stop_port_process", { pid, elevate });

export const openPorterCredit = () => call<void>("open_porter_credit");
