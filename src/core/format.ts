export function bytes(n: number): string {
  if (n < 1000) return `${n} o`;
  const u = ["Ko", "Mo", "Go", "To"];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export function ago(unixSecs: number): string {
  if (!unixSecs) return "date inconnue";
  const days = Math.floor((Date.now() / 1000 - unixSecs) / 86400);
  if (days < 1) return "aujourd'hui";
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  const y = Math.floor(days / 365);
  return `il y a ${y} an${y > 1 ? "s" : ""}`;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
