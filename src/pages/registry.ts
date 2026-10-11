import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { page as home } from "./home";
import { page as updates } from "./updates";
import { page as clean } from "./clean";
import { page as settings } from "./settings";
import { page as applications } from "./applications";

export interface PageDef {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
  position?: "top" | "bottom";
}

/** Pour ajouter une page : créer un dossier dans src/pages avec un index.ts exportant `page`, puis l'ajouter ici. */
export const pages: PageDef[] = [home, updates, clean, applications, settings];
