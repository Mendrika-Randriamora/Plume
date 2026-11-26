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
import { page as config } from "./config";

/** Clés de titre utilisées à la fois par la barre latérale et les en-têtes de page. */
export type PageTitleKey =
  | "home.title"
  | "resources.title"
  | "processes.title"
  | "updates.title"
  | "clean.title"
  | "disk.title"
  | "applications.title"
  | "config.title"
  | "repositories.title"
  | "settings.title";

export interface PageDef {
  id: string;
  label: PageTitleKey;
  icon: AppIcon;
  component: ComponentType;
  position?: "top" | "bottom";
  /** Page toujours accessible, même si elle a été masquée dans les réglages. */
  locked?: boolean;
}

/** Pour ajouter une page : créer un dossier dans src/pages avec un index.ts exportant `page`, puis l'ajouter ici. */
export const pages: PageDef[] = [home, resources, processes, updates, clean, disk, applications, config, repositories, settings];

/**
 * Pages dans l'ordre choisi par l'utilisateur. Les identifiants inconnus sont
 * ignorés et les nouvelles pages, absentes de l'ordre enregistré, sont ajoutées
 * à la fin : un ajout au registre n'écrase donc pas les préférences existantes.
 */
export function orderedPages(order: readonly string[]): PageDef[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const result: PageDef[] = [];

  for (const id of order) {
    const page = byId.get(id);
    if (!page || seen.has(id)) continue;
    seen.add(id);
    result.push(page);
  }

  for (const page of pages) {
    if (!seen.has(page.id)) result.push(page);
  }

  return result;
}

/** Pages visibles dans la barre latérale : ordre choisi, pages masquées retirées, pages verrouillées conservées. */
export function visiblePages(order: readonly string[], hidden: readonly string[]): PageDef[] {
  const hiddenSet = new Set(hidden);
  return orderedPages(order).filter((p) => p.locked || !hiddenSet.has(p.id));
}
