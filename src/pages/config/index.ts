import { lazy } from "react";
import { FileCode } from "@/core/ui";

const ConfigPage = lazy(() => import("./ConfigPage").then((m) => ({ default: m.ConfigPage })));

export const page = {
  id: "config",
  label: "config.title",
  icon: FileCode,
  component: ConfigPage,
  platform: "linux",
} as const;
