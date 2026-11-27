import { call } from "@/core/ipc";
import type { SystemInfo } from "./types";

export const systemInfo = () => call<SystemInfo>("system_info");
