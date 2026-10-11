import { invoke } from "@tauri-apps/api/core";
import type { Application, ApplicationDetails } from "./types";

export async function listApplications(): Promise<Application[]> {
  return await invoke("list_applications");
}

export async function searchApplications(query: string): Promise<Application[]> {
  return await invoke("search_applications", { query });
}

export async function getApplicationDetails(packageName: string, source: string): Promise<ApplicationDetails> {
  return await invoke("get_application_details", { packageName, source });
}

export async function uninstallApplication(packageName: string, source: string): Promise<boolean> {
  return await invoke("uninstall_application", { packageName, source });
}
