import { lazy } from "react";
import { SquarePlay } from "@/core/ui";

const ProcessesPage = lazy(() => import("./ProcessesPage").then((m) => ({ default: m.ProcessesPage })));

export const page = { id: "processes", label: "processes.title", icon: SquarePlay, component: ProcessesPage } as const;
