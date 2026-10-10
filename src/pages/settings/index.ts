import { Settings } from "lucide-react";
import { SettingsPage } from "./SettingsPage";

export const page = { id: "settings", label: "Réglages", icon: Settings, component: SettingsPage, position: "bottom" as const };
