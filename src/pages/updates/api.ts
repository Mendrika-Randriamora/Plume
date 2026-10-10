import { call } from "@/core/ipc";
import type { UpdateInfo } from "./types";

export const checkUpdates = (refresh: boolean) => call<UpdateInfo>("check_updates", { refresh });
export const applyUpdates = () => call<void>("apply_updates");
