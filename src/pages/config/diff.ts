export type DiffKind = "same" | "add" | "remove";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffResult {
  lines: DiffLine[];
  truncated: boolean;
}

/** Au-delà, la matrice de comparaison devient trop lourde pour l'interface. */
export const MAX_DIFF_LINES = 1500;

/**
 * Diff ligne à ligne par plus longue sous-séquence commune. Volontairement
 * limité : les fichiers de configuration restent petits, et un aperçu ne doit
 * jamais figer la fenêtre.
 */
export function diffLines(before: string, after: string): DiffResult {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return { lines: [], truncated: true };
  }

  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i], oldLine, newLine });
      i += 1;
      j += 1;
      oldLine += 1;
      newLine += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      lines.push({ kind: "remove", text: a[i], oldLine, newLine: null });
      i += 1;
      oldLine += 1;
    } else {
      lines.push({ kind: "add", text: b[j], oldLine: null, newLine });
      j += 1;
      newLine += 1;
    }
  }

  while (i < n) {
    lines.push({ kind: "remove", text: a[i], oldLine, newLine: null });
    i += 1;
    oldLine += 1;
  }
  while (j < m) {
    lines.push({ kind: "add", text: b[j], oldLine: null, newLine });
    j += 1;
    newLine += 1;
  }

  return { lines, truncated: false };
}
