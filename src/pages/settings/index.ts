import { lazy } from "react";
import { Settings } from "lucide-react";

const SettingsPage = lazy(() => import("./SettingsPage").then((m) => ({ default: m.SettingsPage })));

export const page = {
  id: "settings",
  label: "settings.title",
  icon: Settings,
  component: SettingsPage,
  position: "bottom",
} as const;
