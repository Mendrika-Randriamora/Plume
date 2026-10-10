export interface Pkg {
  name: string;
  from: string | null;
  to: string | null;
}
export interface UpdateInfo {
  manager: "apt" | "pacman" | "dnf" | "none";
  items: Pkg[];
}
