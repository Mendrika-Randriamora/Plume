import { call } from "@/core/ipc";
import type { FileEntry } from "@/pages/home/types";

export type CleanFilter = "unused" | "largest";
export interface TempItem {
  id: string;
  label: string;
  path: string;
  size: number;
}

export const scanClean = (filter: CleanFilter, onlyFiles: boolean, limit = 100) =>
  call<FileEntry[]>("scan_clean", { filter, onlyFiles, limit });
export const deleteToTrash = (paths: string[]) => call<void>("delete_to_trash", { paths });
export const scanTemp = () => call<TempItem[]>("scan_temp");
export const clearTemp = (paths: string[]) => call<void>("clear_temp", { paths });
export const reveal = (path: string) => call<void>("reveal", { path });
