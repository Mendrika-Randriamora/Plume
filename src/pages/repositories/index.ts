import { Package } from "@/core/ui";
import { lazy } from "react";

const RepositoriesPage = lazy(() =>
  import("./RepositoriesPage").then((m) => ({ default: m.RepositoriesPage })),
);

export const page = {
  id: "repositories",
  label: "repositories.title",
  icon: Package,
  component: RepositoriesPage,
} as const;
