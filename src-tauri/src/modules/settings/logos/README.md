# Logos SVG embarqués

Ce dossier contient les logos affichés dans la carte « À propos » des réglages
(`system_info.logo`). Ils sont **compilés dans le binaire** au build via
`build.rs` : aucun accès réseau ni lecture de fichier à l'exécution.

Le dossier est scanné automatiquement, il suffit donc de déposer un `.svg` ici
puis de relancer `npm run tauri dev` (ou `cargo build`) : aucune modification de
code n'est nécessaire.

## Arborescence et nommage

| Dossier | Fichier | Clé générée |
| --- | --- | --- |
| `linux/` | `<ID>.svg` | `linux/<ID>` |
| `linux/` | `linux.svg` | `linux/linux` (repli générique) |
| `windows/` | `windows-10.svg` | `windows/windows-10` |
| `windows/` | `windows-11.svg` | `windows/windows-11` |
| `windows/` | `windows.svg` | `windows/windows` (repli générique) |
| `macos/` | `macos.svg` | `macos/macos` |

- Le nom de fichier devient la clé, sans extension : noms **en minuscules**, sans
  espace, sans accent, sans caractère spécial. Seule l'extension `.svg` est
  reconnue (insensible à la casse).
- `linux/<ID>.svg` reprend la valeur `ID=` de `/etc/os-release`, en minuscules :
  `debian.svg`, `ubuntu.svg`, `fedora.svg`, `arch.svg`, `linuxmint.svg`,
  `opensuse-tumbleweed.svg`, `opensuse-leap.svg`, `manjaro.svg`, `pop.svg`,
  `elementary.svg`, `kali.svg`, `almalinux.svg`, `rockylinux.svg`, `centos.svg`,
  `gentoo.svg`, `nixos.svg`, `void.svg`, `zorin.svg`, `deepin.svg`,
  `raspberrypi.svg`… En cas d'absence, `ID_LIKE` est essayé à son tour
  (`ubuntu` → `debian`, par exemple).
- `linux/linux.svg` est le dernier repli Linux (logo générique).
- Windows : `windows-10.svg` et `windows-11.svg` sont choisis d'après le numéro
  de build (`10.0.22631` → Windows 11 si le build est ≥ 22000), avec
  `windows.svg` en repli.

## Taille et rendu

La zone d'affichage est définie dans `src/styles/global.css`
(`.system-about-logo`) : **300 × 200 px CSS**, logo centré et redimensionné avec
`mask-size: contain`.

- Format recommandé : **carré**, `viewBox="0 0 512 512"` (256 × 256 convient
  aussi ; 24 × 24 est accepté). Un carré s'affiche donc en **200 × 200 px**.
- Dessinez le logo **remplissant le viewBox** : les marges internes réduisent
  d'autant la taille visible.
- `viewBox` obligatoire ; éviter `width`/`height` figés (ils n'apportent rien en
  masque).
- Vectoriel uniquement (chemins, formes). Pas de `<image>` externe, pas de
  police ni de `<text>` : convertir le texte en chemins. Les `<style>` internes
  et les transformations sont acceptés.
- Poids conseillé : **< 20 Ko** par fichier. Encodage **UTF-8**.

## Couleur et transparence

Le rendu monochrome est géré par le code (masque CSS rempli avec
`currentColor`), donc **la couleur d'origine du SVG n'a aucune importance** :
un logo orange, bleu ou multicolore s'affichera toujours dans la couleur du
texte, et suivra les thèmes clair/sombre.

En revanche, seuls le **canal alpha** et la silhouette comptent :

- fond **transparent** obligatoire, ne pas ajouter de rectangle de fond opaque
  (il remplirait tout le cadre) ;
- éviter les dégradés de transparence et les ombres douces (rendu sale en
  masque) ; préférer des aplats opaques ;
- un contour avec `fill="none"` et `stroke` fonctionne, puisqu'il produit de
  l'alpha.

## Ordre de résolution

1. SVG local trouvé dans les thèmes d'icônes de la distribution (logo officiel,
   toujours prioritaire) ;
2. SVG embarqué de ce dossier, par `ID` puis `ID_LIKE` ;
3. raster local (PNG), dernier recours quand aucun SVG n'existe ;
4. logo générique embarqué (`linux/linux`) puis icône `Monitor`.

Déposer `linux/debian.svg` corrige donc l'affichage pixelisé de Debian, dont le
`/usr/share/pixmaps/debian-logo.png` ne fait que 48 × 48.

Les licences et attributions sont à consigner dans `SOURCES.md`.
