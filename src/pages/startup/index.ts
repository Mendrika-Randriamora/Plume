import { lazy } from "react";
import { Power } from "@/core/ui";

const StartupPage = lazy(() => import("./StartupPage").then((m) => ({ default: m.StartupPage })));

export const page = { id: "startup", label: "startup.title", icon: Power, component: StartupPage } as const;
