import type { LucideProps } from "lucide-react";
import { Pin as LucidePin, PinOff as LucidePinOff, Plug as LucidePlug } from "lucide-react";
import { Pin as SketchyPin, PinOff as SketchyPinOff, Plug as SketchyPlug } from "@sketchyicons/react";
import { useSettings } from "@/core/settings/SettingsProvider";

/**
 * Icônes locales à la page Porter. Elles suivent la bibliothèque choisie dans
 * les réglages, sans modifier le catalogue partagé de `@/core/ui`.
 */
export function Pin(props: LucideProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPin : LucidePin;
  return <Icon {...props} />;
}

export function PinOff(props: LucideProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPinOff : LucidePinOff;
  return <Icon {...props} />;
}

export function Plug(props: LucideProps) {
  const { settings } = useSettings();
  const Icon = settings.iconLibrary === "sketchy" ? SketchyPlug : LucidePlug;
  return <Icon {...props} />;
}
