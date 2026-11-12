import { RotateCcw } from "lucide-react";
import { Button, Card, PageHeader } from "@/core/ui";
import { useSettings } from "@/core/settings/SettingsProvider";
import { resolveDark, FONTS } from "@/core/settings/theme";
import type { FontKey, Permissions, Rgb, ThemeMode } from "@/core/settings/store";

const THEMES: [ThemeMode, string][] = [["light", "Clair"], ["dark", "Sombre"], ["system", "Système"]];
const PERMS: [keyof Permissions, string, string][] = [
  ["scanHome", "Lire mon dossier personnel", "Nécessaire pour trouver les gros fichiers. Rien n'est envoyé sur Internet."],
  ["deleteFiles", "Mettre des fichiers à la corbeille", "Toujours après votre confirmation. Récupérable depuis la corbeille."],
  ["systemChanges", "Modifier le système", "Mises à jour et retrait de programmes. Votre mot de passe est demandé par le système."],
];

export function SettingsPage() {
  const { settings: s, update, reset } = useSettings();
  const dark = resolveDark(s);
  const rgb = dark ? s.baseDark : s.baseLight;
  const setRgb = (i: number, v: number) => {
    const next = [...rgb] as Rgb;
    next[i] = v;
    update(dark ? { baseDark: next } : { baseLight: next });
  };

  return (
    <>
      <PageHeader
        title="Réglages"
        subtitle="Adaptez Plume à vos goûts."
        action={<Button variant="ghost" icon={RotateCcw} onClick={reset}>Réinitialiser</Button>}
      />

      <Card title="Apparence">
        <div className="field">
          <span>Thème</span>
          <div className="seg">
            {THEMES.map(([id, label]) => (
              <button key={id} className={s.theme === id ? "on" : ""} onClick={() => update({ theme: id })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Police</span>
          <select value={s.font} onChange={(e) => update({ font: e.target.value as FontKey })}>
            {(Object.keys(FONTS) as FontKey[]).map((k) => (
              <option key={k} value={k}>{FONTS[k].label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>Taille du texte · {s.fontSize}px</span>
          <input type="range" min={13} max={20} value={s.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} />
        </div>
        <div className="field col">
          <span>Couleur de fond ({dark ? "thème sombre" : "thème clair"})</span>
          {(["Rouge", "Vert", "Bleu"] as const).map((l, i) => (
            <label key={l} className="slider">
              <span className="small muted">{l} · {rgb[i]}</span>
              <input type="range" min={0} max={255} value={rgb[i]} onChange={(e) => setRgb(i, +e.target.value)} />
            </label>
          ))}
        </div>
      </Card>

      <Card title="Autorisations" hint="Vous gardez le contrôle : chaque action peut être désactivée.">
        {PERMS.map(([key, title, desc]) => (
          <label key={key} className="perm">
            <input
              type="checkbox"
              checked={s.permissions[key]}
              onChange={(e) => update({ permissions: { ...s.permissions, [key]: e.target.checked } })}
            />
            <span>
              {title}
              <span className="muted small block">{desc}</span>
            </span>
          </label>
        ))}
      </Card>

      <Card title="Politique de confidentialité">
        <p className="small">
          Plume fonctionne entièrement sur votre ordinateur. Aucune donnée n{`'`}est collectée ni envoyée.
          Elle lit uniquement votre dossier personnel (en ignorant les dossiers de dépendances comme node_modules
          ou vendor) et ne supprime jamais définitivement un de vos fichiers : ils vont à la corbeille.
          Les modifications du système passent par la fenêtre d{`'`}autorisation de votre distribution.
          Vos réglages sont conservés localement.
        </p>
      </Card>
    </>
  );
}
