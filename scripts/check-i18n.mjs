#!/usr/bin/env node
/**
 * Vérifie la cohérence des traductions :
 *  1. fr.json et en.json doivent exposer exactement les mêmes clés ;
 *  2. les variables d'interpolation ({{...}}) doivent être identiques ;
 *  3. aucune chaîne française ne doit rester en dur dans les fichiers .tsx.
 *
 * Usage : npm run check:i18n
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const localesDir = join(root, "src/core/i18n/locales");
const srcDir = join(root, "src");

const errors = [];

/** Aplatit un objet de traductions en { "a.b.c": "valeur" }. */
function flatten(value, prefix = "", out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else if (typeof child === "string") {
      out[path] = child;
    } else {
      errors.push(`valeur non textuelle : ${path}`);
    }
  }
  return out;
}

function loadLocale(name) {
  const file = join(localesDir, `${name}.json`);
  try {
    return flatten(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    errors.push(`impossible de lire ${relative(root, file)} : ${error.message}`);
    return {};
  }
}

function placeholders(text) {
  return new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]));
}

// --- 1. Parité des clés et des variables --------------------------------

const fr = loadLocale("fr");
const en = loadLocale("en");
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();

for (const key of frKeys) {
  if (!(key in en)) errors.push(`clé absente dans en.json : ${key}`);
}
for (const key of enKeys) {
  if (!(key in fr)) errors.push(`clé absente dans fr.json : ${key}`);
}

for (const key of frKeys) {
  if (!(key in en)) continue;
  if (!fr[key].trim()) errors.push(`traduction vide dans fr.json : ${key}`);
  if (!en[key].trim()) errors.push(`traduction vide dans en.json : ${key}`);

  const expected = placeholders(fr[key]);
  const actual = placeholders(en[key]);
  for (const name of expected) {
    if (!actual.has(name)) errors.push(`variable {{${name}}} absente dans en.json : ${key}`);
  }
  for (const name of actual) {
    if (!expected.has(name)) errors.push(`variable {{${name}}} absente dans fr.json : ${key}`);
  }
}

// --- 2. Chaînes françaises dans les .tsx --------------------------------

/** Retire les commentaires en conservant les numéros de ligne. */
function stripComments(code) {
  let out = "";
  let i = 0;
  let quote = null;

  const skip = (until) => {
    while (i < code.length && !until()) {
      out += code[i] === "\n" ? "\n" : " ";
      i++;
    }
  };

  while (i < code.length) {
    const char = code[i];
    const next = code[i + 1];

    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i++;
      continue;
    }

    if (char === "/" && next === "/") {
      skip(() => code[i] === "\n");
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      out += "  ";
      skip(() => code[i] === "*" && code[i + 1] === "/");
      i += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;

    out += char;
    i++;
  }

  return out;
}

const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/gi;
const FRENCH_WORDS = new RegExp(
  "\\b(" +
    [
      "Aucun",
      "Aucune",
      "Annuler",
      "Confirmer",
      "Chargement",
      "Rechercher",
      "Recherche",
      "Erreur",
      "Erreurs",
      "Fichier",
      "Fichiers",
      "dossier",
      "Dossier",
      "Dossiers",
      "Supprimer",
      "supprim",
      "autorisation",
      "Autorisation",
      "corbeille",
      "Corbeille",
      "Réglages",
      "Mises",
      "Nettoyage",
      "Accueil",
      "Processus",
      "Ressources",
      "Langue",
      "Police",
      "Thème",
      "Toujours",
      "Votre",
      "Cette",
      "Afficher",
      "Trier",
      "Ouvrir",
      "Fermer",
      "Enregistrer",
      "disponible",
      "disponibles",
      "utilisée",
      "utilisé",
      "inconnue",
      "Inconnue",
      "Sélectionner",
      "sélectionné",
      "sélectionnés",
      "volumineux",
      "temporaires",
      "désactivée",
      "désactivé",
      "bientôt",
      "Aujourd",
      "hier",
    ].join("|") +
    ")\\b",
  "gi",
);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules") walk(path, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

function lineOf(code, index) {
  return code.slice(0, index).split("\n").length;
}

for (const file of walk(srcDir)) {
  const original = readFileSync(file, "utf8");
  const code = stripComments(original);
  const rel = relative(root, file).replaceAll("\\", "/");

  for (const pattern of [ACCENTS, FRENCH_WORDS]) {
    for (const match of code.matchAll(pattern)) {
      const line = lineOf(code, match.index ?? 0);
      const excerpt = original.split("\n")[line - 1]?.trim() ?? "";
      errors.push(`texte français en dur ${rel}:${line} → ${excerpt}`);
    }
  }
}

// --- 3. Rapport ---------------------------------------------------------

console.log(`Clés fr.json : ${frKeys.length} · clés en.json : ${enKeys.length}`);

if (errors.length > 0) {
  const unique = [...new Set(errors)];
  console.error(`\n${unique.length} problème(s) détecté(s) :`);
  for (const error of unique) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log("✓ Traductions cohérentes, aucune chaîne française en dur dans les .tsx.");
