import { call } from "@/core/ipc";
import type { Application, ApplicationDetails } from "./types";

/** Inventaire gardé en mémoire par Rust : rescanne seulement s'il est encore vide. */
export async function listApplications(): Promise<Application[]> {
  return await call<Application[]>("list_applications");
}

/** Rescanne les fichiers .desktop et remplace l'inventaire gardé en mémoire par Rust. */
export async function refreshApplications(): Promise<Application[]> {
  return await call<Application[]>("refresh_applications");
}

export async function searchApplications(query: string): Promise<Application[]> {
  return await call<Application[]>("search_applications", { query });
}

export async function getApplicationDetails(desktopId: string): Promise<ApplicationDetails> {
  return await call<ApplicationDetails>("get_application_details", { desktopId });
}

export async function uninstallApplication(desktopId: string): Promise<boolean> {
  return await call<boolean>("uninstall_application", { desktopId });
}
