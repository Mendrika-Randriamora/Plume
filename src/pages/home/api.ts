import { call } from "@/core/ipc";
import type { Highlights, ObsoleteInfo, SystemStats } from "./types";

export const systemStats = () => call<SystemStats>("system_stats");
export const homeHighlights = () => call<Highlights>("home_highlights");
export const reveal = (path: string) => call<void>("reveal", { path });
export const listObsolete = () => call<ObsoleteInfo>("list_obsolete");
export const removeObsolete = () => call<void>("remove_obsolete");
