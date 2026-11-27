import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Notice, Plus, X } from "@/core/ui";
import { getApplicationDetails, listApplications } from "@/pages/applications/api";
import { ScheduleText } from "../schedule";
import type { StartupInput } from "../api";

interface Props {
  isOpen: boolean;
  cronSupported: boolean;
  onClose: () => void;
  onSubmit: (input: StartupInput) => Promise<string | null>;
}

interface AppOption {
  id: string;
  name: string;
}

const PRESETS = [
  { key: "startup.presets.daily9", expr: "0 9 * * *" },
  { key: "startup.presets.daily1830", expr: "30 18 * * *" },
  { key: "startup.presets.hourly", expr: "0 * * * *" },
  { key: "startup.presets.weekdays8", expr: "0 8 * * 1-5" },
] as const;

const DEFAULT_SCHEDULE = "0 9 * * *";

export function StartupModal({ isOpen, cronSupported, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [appId, setAppId] = useState("");
  const [apps, setApps] = useState<AppOption[] | null>(null);
  const [trigger, setTrigger] = useState<"boot" | "schedule">("boot");
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Le formulaire repart à zéro à chaque ouverture.
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setCommand("");
    setAppId("");
    setApps(null);
    setTrigger("boot");
    setSchedule(DEFAULT_SCHEDULE);
    setError(null);
    setBusy(false);
  }, [isOpen]);

  // L'inventaire des applications n'est chargé qu'à l'ouverture du formulaire.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void listApplications()
      .then((list) => {
        if (active) setApps(list.map((app) => ({ id: app.id, name: app.name })));
      })
      .catch(() => {
        if (active) setApps([]);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const close = () => {
    if (!busy) onClose();
  };

  const selectApp = async (id: string) => {
    setAppId(id);
    if (!id) return;

    try {
      const details = await getApplicationDetails(id);
      if (!details.exec) {
        setError(t("startup.modal.appDetails"));
        return;
      }
      setCommand(details.exec);
      setName((current) => (current.trim() ? current : details.name));
    } catch {
      setError(t("startup.modal.appDetails"));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if (!name.trim() || !command.trim()) {
      setError(t("startup.modal.invalid"));
      return;
    }
    if (trigger === "schedule" && !schedule.trim()) {
      setError(t("startup.modal.scheduleInvalid"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const message = await onSubmit({
        name: name.trim(),
        command: command.trim(),
        schedule: trigger === "schedule" ? schedule.trim() : null,
      });
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("startup.modal.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{t("startup.modal.title")}</h2>
          <Button
            variant="ghost"
            icon={X}
            disabled={busy}
            onClick={close}
            aria-label={t("common.close")}
          />
        </header>

        <form className="modal-content" onSubmit={(event) => void submit(event)}>
          <p className="muted small">{t("startup.modal.hint")}</p>

          <div className="repo-form">
            <label className="field col">
              <span>{t("startup.modal.application")}</span>
              <select
                className="text-input"
                value={appId}
                disabled={apps === null || busy}
                onChange={(event) => void selectApp(event.target.value)}
              >
                <option value="">
                  {apps === null
                    ? t("startup.modal.applicationLoading")
                    : t("startup.modal.customCommand")}
                </option>
                {(apps ?? []).map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field col">
              <span>{t("startup.modal.name")}</span>
              <input
                className="text-input"
                value={name}
                placeholder={t("startup.modal.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="field col">
              <span>{t("startup.modal.command")}</span>
              <input
                className="text-input"
                value={command}
                placeholder={t("startup.modal.commandPlaceholder")}
                onChange={(event) => setCommand(event.target.value)}
              />
            </label>

            <label className="field col">
              <span>{t("startup.modal.trigger")}</span>
              <select
                className="text-input"
                value={trigger}
                disabled={busy}
                onChange={(event) =>
                  setTrigger(event.target.value === "schedule" ? "schedule" : "boot")
                }
              >
                <option value="boot">{t("startup.trigger.boot")}</option>
                <option value="schedule" disabled={!cronSupported}>
                  {t("startup.trigger.schedule")}
                </option>
              </select>
            </label>

            {trigger === "schedule" && (
              <>
                <div className="chips">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.expr}
                      type="button"
                      className="chip chip-button"
                      disabled={busy}
                      onClick={() => setSchedule(preset.expr)}
                    >
                      {t(preset.key)}
                    </button>
                  ))}
                </div>

                <label className="field col">
                  <span>{t("startup.modal.schedule")}</span>
                  <input
                    className="text-input"
                    value={schedule}
                    placeholder={t("startup.modal.schedulePlaceholder")}
                    onChange={(event) => setSchedule(event.target.value)}
                  />
                  <span className="muted small">
                    <ScheduleText expr={schedule} />
                  </span>
                </label>
              </>
            )}
          </div>

          {error && <Notice>{error}</Notice>}

          <div className="repo-add-foot">
            <div className="row gap">
              <Button variant="ghost" type="button" disabled={busy} onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" icon={Plus} busy={busy} disabled={!name.trim() || !command.trim()}>
                {t("startup.modal.submit")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
