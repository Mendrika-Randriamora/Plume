import { lazy } from "react";
import { Package } from "lucide-react";

const RepositoriesPage = lazy(() =>
  import("./RepositoriesPage").then((m) => ({ default: m.RepositoriesPage })),
);

export const page = {
  id: "repositories",
  label: "repositories.title",
  icon: Package,
  component: RepositoriesPage,
} as const;
