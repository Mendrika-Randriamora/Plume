import { createContext, useContext } from "react";

export const NavContext = createContext<{ go: (id: string) => void }>({ go: () => {} });
export const useNav = () => useContext(NavContext);
