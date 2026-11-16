export type ApplicationSource = "apt" | "dnf" | "pacman" | "snap" | "flatpak" | "manuel";

export interface Application {
  id: string;
  name: string;
  package_name: string;
  version: string | null;
  size: number | null;
  source: ApplicationSource;
}

export interface ApplicationDetails {
  name: string;
  package_name: string;
  version: string | null;
  size: number | null;
  source: ApplicationSource;
  desktop_file: string | null;
  desktop_content: string | null;
  description: string | null;
  icon: string | null;
  categories: string[] | null;
  exec: string | null;
}
