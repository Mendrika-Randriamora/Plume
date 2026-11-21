import { call } from "@/core/ipc";

export type PackageManager = "apt" | "dnf" | "pacman" | "none";

export interface Repository {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  managed: boolean;
  source: string;
  details: string;
  suite: string;
  components: string;
  gpgKey: string;
}

export interface RepositoryInfo {
  manager: PackageManager;
  distro: string;
  codename: string | null;
  repositories: Repository[];
}

export interface AddRepositoryInput {
  name: string;
  url: string;
  suite: string;
  components: string;
  gpgKey: string;
}

export const listRepositories = () => call<RepositoryInfo>("list_repositories");

export const addRepository = (input: AddRepositoryInput) =>
  call<void>("add_repository", {
    name: input.name,
    url: input.url,
    suite: input.suite,
    components: input.components,
    gpgKey: input.gpgKey,
  });

export interface UpdateRepositoryInput extends AddRepositoryInput {
  id: string;
}

export const updateRepository = (input: UpdateRepositoryInput) =>
  call<void>("update_repository", {
    id: input.id,
    name: input.name,
    url: input.url,
    suite: input.suite,
    components: input.components,
    gpgKey: input.gpgKey,
  });

export const removeRepository = (id: string) =>
  call<void>("remove_repository", { id });

export const setRepositoryEnabled = (id: string, enabled: boolean) =>
  call<void>("set_repository_enabled", { id, enabled });
