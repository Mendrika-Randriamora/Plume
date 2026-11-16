import { lazy } from "react";
import { Sparkles } from "lucide-react";

const CleanPage = lazy(() => import("./CleanPage").then((m) => ({ default: m.CleanPage })));

export const page = { id: "clean", label: "clean.title", icon: Sparkles, component: CleanPage } as const;
