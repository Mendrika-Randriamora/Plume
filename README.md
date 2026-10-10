# Plume

Application de bureau Linux pour garder votre ordinateur léger : mémoire, espace disque,
fichiers oubliés, mises à jour, paquets inutiles. Tauri 2 (Rust + React/TypeScript), icônes Lucide.

## Prérequis (une seule fois)

1. **Node.js 18+** et **Rust** (https://rustup.rs)
2. Bibliothèques système Tauri :
   - Debian/Ubuntu : `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
   - Fedora : `sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel libappindicator-gtk3-devel librsvg2-devel && sudo dnf group install "c-development"`
   - Arch : `sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl xdotool libappindicator-gtk3 librsvg`
3. À l'exécution : `polkit` (fenêtre de mot de passe), `xdg-utils` (ouvrir un dossier).

## Lancer / construire

```bash
npm install
npm run tauri dev       # mode développement
npm run tauri build     # paquets dans src-tauri/target/release/bundle/ (.deb, .rpm, .AppImage)
```

Icône personnalisée : `npm run tauri icon mon-logo.png` (remplace src-tauri/icons).

## Structure modulaire

```
src/
  core/            socle partagé : ipc, format, settings, layout, ui
  pages/
    registry.ts    liste des pages (l'ordre = l'ordre du menu)
    home/ updates/ clean/ settings/     UNE PAGE = UN DOSSIER
      index.ts     déclaration (id, libellé, icône, composant)
      XxxPage.tsx  l'écran     api.ts  appels Rust     types.ts  types     components/
src-tauri/src/
  shared/          scanner de /home (ignore node_modules, vendor, venv, dossiers cachés…)
  modules/         home/ updates/ clean/   un module Rust par page
```

**Ajouter une page** : créer `src/pages/ma-page/` avec un `index.ts` exportant `page`, l'ajouter dans
`registry.ts` ; côté Rust, créer `src-tauri/src/modules/ma_page/mod.rs` et enregistrer ses commandes dans `main.rs`.

## Comportement et sécurité

- Gestionnaires pris en charge : apt, pacman, dnf. Actions système via `pkexec`.
- Les fichiers vont à la **corbeille** (jamais de suppression définitive) ; seuls `~/.cache/*` et la corbeille sont vidés pour les temporaires.
- Les chemins hors de `/home` sont refusés côté Rust.
- Températures : lues via les capteurs du noyau (hwmon) ; `nvidia-smi` en secours pour le GPU. Un capteur absent n'est simplement pas affiché (la RAM en a rarement).
- Réglages (thème, police, couleur RGB, autorisations) : stockés localement.
