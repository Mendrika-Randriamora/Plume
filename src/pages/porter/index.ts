import { lazy } from "react";
import { Plug } from "./icons";

const PorterPage = lazy(() => import("./PorterPage").then((m) => ({ default: m.PorterPage })));

export const page = { id: "porter", label: "porter.title", icon: Plug, component: PorterPage } as const;
