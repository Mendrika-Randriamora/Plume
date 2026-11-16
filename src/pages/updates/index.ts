import { lazy } from "react";
import { RefreshCw } from "lucide-react";

const UpdatesPage = lazy(() => import("./UpdatesPage").then((m) => ({ default: m.UpdatesPage })));

export const page = { id: "updates", label: "updates.title", icon: RefreshCw, component: UpdatesPage } as const;
