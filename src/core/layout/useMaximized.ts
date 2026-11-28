import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

/**
 * Suit l’état de maximisation de la fenêtre principale.
 * `onResized` + `isMaximized` permettent aux commandes de bascule de se
 * synchroniser avec l’état réel de l’OS.
 */
export function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let mounted = true;
    const win = getCurrentWindow();

    void win.isMaximized().then((value) => {
      if (mounted) setMaximized(value);
    });
    void win
      .onResized(() => {
        void win.isMaximized().then((value) => {
          if (mounted) setMaximized(value);
        });
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  return maximized;
}
