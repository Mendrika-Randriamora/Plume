import { call } from "@/core/ipc";
import type { ResourceSnapshot } from "./types";

export const resourceSnapshot = () => call<ResourceSnapshot>("resource_snapshot");
