import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/**
 * Chaque langage est chargé à la demande : le bundle de démarrage ne contient
 * aucun mode CodeMirror. Un mode inconnu retombe simplement en texte brut.
 */
const loaders: Record<string, () => Promise<Extension>> = {
  shell: async () => {
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return StreamLanguage.define(shell);
  },
  ini: async () => {
    const { properties } = await import("@codemirror/legacy-modes/mode/properties");
    return StreamLanguage.define(properties);
  },
  properties: async () => {
    const { properties } = await import("@codemirror/legacy-modes/mode/properties");
    return StreamLanguage.define(properties);
  },
  yaml: async () => {
    const { yaml } = await import("@codemirror/legacy-modes/mode/yaml");
    return StreamLanguage.define(yaml);
  },
  toml: async () => {
    const { toml } = await import("@codemirror/legacy-modes/mode/toml");
    return StreamLanguage.define(toml);
  },
  nginx: async () => {
    const { nginx } = await import("@codemirror/legacy-modes/mode/nginx");
    return StreamLanguage.define(nginx);
  },
  dockerfile: async () => {
    const { dockerFile } = await import("@codemirror/legacy-modes/mode/dockerfile");
    return StreamLanguage.define(dockerFile);
  },
  xml: async () => {
    const { xml } = await import("@codemirror/legacy-modes/mode/xml");
    return StreamLanguage.define(xml);
  },
  json: async () => {
    const { json } = await import("@codemirror/legacy-modes/mode/javascript");
    return StreamLanguage.define(json);
  },
};

export async function loadLanguage(name: string): Promise<Extension | null> {
  const loader = loaders[name];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}
