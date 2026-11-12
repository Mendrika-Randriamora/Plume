import { call } from "@/core/ipc";
import type { Application, ApplicationDetails } from "./types";

export async function listApplications(): Promise<Application[]> {
  return await call<Application[]>("list_applications");
}

export async function searchApplications(query: string): Promise<Application[]> {
  return await call<Application[]>("search_applications", { query });
}

export async function getApplicationDetails(packageName: string, source: string): Promise<ApplicationDetails> {
  return await call<ApplicationDetails>("get_application_details", { packageName, source });
}

export async function uninstallApplication(packageName: string, source: string): Promise<boolean> {
  return await call<boolean>("uninstall_application", { packageName, source });
}
