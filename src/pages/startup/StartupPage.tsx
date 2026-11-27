import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  SquarePlay,
  Trash2,
  Button,
  Card,
  ConfirmButton,
  Empty,
  Loading,
  Notice,
  PageHeader,
} from "@/core/ui";
import {
  createStartupEntry,
  listStartupEntries,
  removeStartupEntry,
  setStartupEntryEnabled,
} from "./api";
import type { StartupEntry, StartupInput, StartupList } from "./api";
import { ScheduleText } from "./schedule";
import { StartupModal } from "./components/StartupModal";

interface RowProps {
  entry: StartupEntry;
  busy: boolean;
  onToggle: (entry: StartupEntry) => void;
  onRemove: (entry: StartupEntry) => void;
}

function EntryRow({ entry, busy, onToggle, onRemove }: RowProps) {
  const { t } = useTranslation();

  return (
    <li className="repo-row">
      <div className="grow">
        <div className="row gap repo-title">
          <span className="repo-name">{entry.name}</span>
          <span className={`chip ${entry.enabled ? "" : "muted"}`}>
            {entry.enabled ? t("startup.enabled") : t("startup.disabled")}
          </span>
          {!entry.managed && <span className="chip">{t("startup.system")}</span>}
        </div>
        <span className="muted small block ellipsis">{entry.command}</span>
        {entry.schedule && (
          <span className="muted small block">
            {entry.schedule} · <ScheduleText expr={entry.schedule} />
          </span>
        )}
      </div>

      <div className="row gap repo-actions">
        <Button
          variant="ghost"
          icon={entry.enabled ? PowerOff : Power}
          disabled={!entry.managed || busy}
          onClick={() => onToggle(entry)}
        >
          {entry.enabled ? t("startup.disable") : t("startup.enable")}
        </Button>
        <ConfirmButton
          label={t("startup.remove")}
          confirmLabel={t("startup.removeConfirm")}
          icon={Trash2}
          iconOnly
          disabled={!entry.managed || busy}
          busy={busy}
          onConfirm={() => onRemove(entry)}
        />
      </div>
    </li>
  );
}

export function StartupPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<StartupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setInfo(await listStartupEntries());
      setError(null);
    } catch {
      setError(t("startup.errors.load"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const message = (code: string): string => {
    switch (code) {
      case "invalid_input":
        return t("startup.modal.invalid");
      case "invalid_schedule":
        return t("startup.errors.schedule");
      case "unmanaged_entry":
        return t("startup.errors.unmanaged");
      case "cron_unavailable":
        return t("startup.errors.cronUnavailable");
      case "crontab_failed":
        return t("startup.errors.crontab");
      default:
        return t("startup.errors.generic");
    }
  };

  const run = async (action: () => Promise<void>) => {
    setActing(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setActing(false);
    }
  };

  const submit = async (input: StartupInput): Promise<string | null> => {
    setActing(true);
    setError(null);
    try {
      await createStartupEntry(input.name, input.command, input.schedule);
      await load();
      setOpen(false);
      return null;
    } catch (e) {
      return message((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const boot = info?.entries.filter((entry) => entry.trigger === "boot") ?? [];
  const scheduled = info?.entries.filter((entry) => entry.trigger === "schedule") ?? [];

  return (
    <>
      <PageHeader
        title={t("startup.title")}
        subtitle={t("startup.subtitle")}
        action={
          <div className="row gap">
            <Button
              variant="ghost"
              icon={RefreshCw}
              busy={busy || acting}
              onClick={() => void load()}
              title={t("startup.refresh")}
            >
              {t("startup.refresh")}
            </Button>
            <Button icon={Plus} disabled={!info || acting} onClick={() => setOpen(true)}>
              {t("startup.add")}
            </Button>
          </div>
        }
      />

      {error && <Notice>{error}</Notice>}
      {info && !info.cronSupported && <Notice>{t("startup.cronUnavailable")}</Notice>}

      {!info ? (
        !error && <Loading text={t("startup.loading")} />
      ) : (
        <>
          <Card title={t("startup.boot.title")} hint={t("startup.boot.hint")}>
            {boot.length === 0 ? (
              <Empty icon={Power} text={t("startup.boot.empty")} />
            ) : (
              <ul className="list repo-list">
                {boot.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    busy={acting}
                    onToggle={(item) => void run(() => setStartupEntryEnabled(item.id, !item.enabled))}
                    onRemove={(item) => void run(() => removeStartupEntry(item.id))}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("startup.schedule.title")} hint={t("startup.schedule.hint")}>
            {scheduled.length === 0 ? (
              <Empty icon={SquarePlay} text={t("startup.schedule.empty")} />
            ) : (
              <ul className="list repo-list">
                {scheduled.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    busy={acting}
                    onToggle={(item) => void run(() => setStartupEntryEnabled(item.id, !item.enabled))}
                    onRemove={(item) => void run(() => removeStartupEntry(item.id))}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <StartupModal
        isOpen={open}
        cronSupported={info?.cronSupported ?? false}
        onClose={() => setOpen(false)}
        onSubmit={submit}
      />
    </>
  );
}
