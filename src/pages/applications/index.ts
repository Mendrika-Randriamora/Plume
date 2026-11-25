import { lazy } from "react";
import { Grid3X3 } from "@/core/ui";

const ApplicationsPage = lazy(() => import("./ApplicationsPage").then((m) => ({ default: m.ApplicationsPage })));

export const page = { id: "applications", label: "applications.title", icon: Grid3X3, component: ApplicationsPage } as const;
