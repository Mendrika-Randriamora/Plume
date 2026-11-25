import { lazy } from "react";
import { Activity } from "@/core/ui";

const ResourcesPage = lazy(() => import("./ResourcesPage").then((m) => ({ default: m.ResourcesPage })));

export const page = { id: "resources", label: "resources.title", icon: Activity, component: ResourcesPage } as const;
