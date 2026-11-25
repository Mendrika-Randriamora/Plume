import type { ComponentType } from "react";
import type { AppIcon } from "@/core/ui";
import { page as home } from "./home";
import { page as resources } from "./resources";
import { page as processes } from "./processes";
import { page as updates } from "./updates";
import { page as clean } from "./clean";
import { page as disk } from "./disk";
import { page as repositories } from "./repositories";
import { page as settings } from "./settings";
import { page as applications } from "./applications";

/** Clés de titre utilisées à la fois par la barre latérale et les en-têtes de page. */
export type PageTitleKey =
  | "home.title"
  | "resources.title"
  | "processes.title"
  | "updates.title"
  | "clean.title"
  | "disk.title"
  | "applications.title"
  | "repositories.title"
  | "settings.title";

export interface PageDef {
  id: string;
  label: PageTitleKey;
  icon: AppIcon;
  component: ComponentType;
  position?: "top" | "bottom";
}

/** Pour ajouter une page : créer un dossier dans src/pages avec un index.ts exportant `page`, puis l'ajouter ici. */
export const pages: PageDef[] = [home, resources, processes, updates, clean, disk, applications, repositories, settings];
