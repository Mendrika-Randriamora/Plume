import { lazy } from "react";
import { HardDrive } from "@/core/ui";

const DiskPage = lazy(() => import("./DiskPage").then((m) => ({ default: m.DiskPage })));

export const page = { id: "disk", label: "disk.title", icon: HardDrive, component: DiskPage } as const;
