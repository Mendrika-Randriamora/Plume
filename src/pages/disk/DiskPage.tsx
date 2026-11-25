import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Empty, HardDrive, Loading, Meter, Notice, PageHeader, RefreshCw } from "@/core/ui";
import { bytes, pct } from "@/core/format";
import { listPartitions } from "./api";
import type { Partition } from "./api";

export function DiskPage() {
  const { t } = useTranslation();
  const [partitions, setPartitions] = useState<Partition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setPartitions(await listPartitions());
      setError(null);
    } catch {
      setError(t("disk.error"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = (p: Partition) => {
    if (p.mountPoint === "/") return "/";
    if (p.mountPoint.toLowerCase().includes("efi")) return t("disk.efi");
    return p.mountPoint;
  };

  const kind = (k: string) => (k === "Unknown" ? t("disk.kindUnknown") : k);

  const total = partitions?.reduce((sum, p) => sum + p.total, 0) ?? 0;
  const free = partitions?.reduce((sum, p) => sum + p.available, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={t("disk.title")}
        subtitle={t("disk.subtitle")}
        action={
          <Button
            variant="ghost"
            icon={RefreshCw}
            busy={busy}
            onClick={() => void load()}
            // aria-label={t("disk.refresh")}
            title={t("disk.refresh")} >
            {t("disk.refresh")}
            </Button>
        }
      />

      {error && <Notice>{error}</Notice>}

      {!partitions ? (
        !error && <Loading text={t("disk.loading")} />
      ) : partitions.length === 0 ? (
        <Empty icon={HardDrive} text={t("disk.empty")} />
      ) : (
        <>
          <Card>
            <div className="disk-summary">
              <div>
                <span className="muted small">{t("disk.summary.total")}</span>
                <strong>{bytes(total)}</strong>
              </div>
              <div>
                <span className="muted small">{t("disk.summary.free")}</span>
                <strong>{bytes(free)}</strong>
              </div>
              <div>
                <span className="muted small">{t("disk.summary.partitions")}</span>
                <strong>{partitions.length}</strong>
              </div>
            </div>
          </Card>

          <div className="grid-2">
            {partitions.map((p) => {
              const used = pct(p.used, p.total);
              const hint = label(p) === p.mountPoint ? p.device : `${p.mountPoint} · ${p.device}`;
              return (
                <Card key={`${p.device}-${p.mountPoint}`} title={label(p)} hint={hint}>
                  <p className="chips">
                    <span className="chip">{p.fileSystem}</span>
                    <span className="chip">{kind(p.kind)}</span>
                    <span className="chip">{p.removable ? t("disk.external") : t("disk.internal")}</span>
                    {p.readOnly && <span className="chip">{t("disk.readOnly")}</span>}
                  </p>

                  <div className="disk-usage">
                    <strong>{bytes(p.available)}</strong>
                    <span className="muted small">{t("disk.freeOf", { total: bytes(p.total) })}</span>
                  </div>
                  <Meter value={used} tone={used >= 90 ? "danger" : used >= 75 ? "warn" : undefined} />
                  <p className="muted small disk-used">{t("disk.used", { percent: used })}</p>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
