import { lazy } from "react";
import { RefreshCw } from "@/core/ui";

const UpdatesPage = lazy(() => import("./UpdatesPage").then((m) => ({ default: m.UpdatesPage })));

export const page = {
  id: "updates",
  label: "updates.title",
  icon: RefreshCw,
  component: UpdatesPage,
  platform: "linux",
} as const;
