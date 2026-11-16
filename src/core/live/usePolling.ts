import { useEffect, useRef } from "react";

/**
 * Lance `task` immédiatement puis à intervalle régulier, et met la boucle en
 * pause quand la fenêtre est masquée (réduite ou onglet en arrière-plan) pour
 * éviter de consommer inutilement. Le retour de visibilité relance aussitôt un
 * relevé, si bien que l'interface n'attend jamais.
 */
export function usePolling(task: () => void, intervalMs: number) {
  const latest = useRef(task);

  useEffect(() => {
    latest.current = task;
  });

  useEffect(() => {
    let timer: number | undefined;

    const run = () => latest.current();
    const start = () => {
      if (timer !== undefined) return;
      run();
      timer = window.setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
