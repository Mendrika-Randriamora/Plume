import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, Power, PowerOff, RefreshCw, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  ConfirmButton,
  Empty,
  Loading,
  Notice,
  PageHeader,
} from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import {
  addRepository,
  listRepositories,
  removeRepository,
  setRepositoryEnabled,
} from "./api";
import type { Repository, RepositoryInfo } from "./api";

interface Form {
  name: string;
  url: string;
  suite: string;
  components: string;
  gpgKey: string;
}

const EMPTY_FORM: Form = {
  name: "",
  url: "",
  suite: "",
  components: "",
  gpgKey: "",
};

export function RepositoriesPage() {
  const { t } = useTranslation();
  const allowed = usePermission("systemChanges");
  const [info, setInfo] = useState<RepositoryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const next = await listRepositories();
      setInfo(next);
      setError(null);
      setForm((current) => ({
        ...current,
        suite: current.suite || next.codename || "",
      }));
    } catch {
      setError(t("repositories.errors.load"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const message = (code: string) => {
    switch (code) {
      case "repo_exists":
        return t("repositories.errors.exists");
      case "managed_only":
        return t("repositories.errors.managedOnly");
      case "invalid_input":
        return t("repositories.errors.invalid");
      case "pkexec_missing":
        return t("repositories.errors.pkexec");
      case "unsupported_package_manager":
        return t("common.unsupportedSystem");
      case "unsupported_operation":
        return t("repositories.errors.unsupported");
      case "command_failed":
        return t("repositories.errors.command");
      default:
        return t("repositories.errors.generic");
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

  const updateField = (key: keyof Form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const add = () =>
    run(async () => {
      await addRepository({
        name: form.name,
        url: form.url,
        suite: form.suite,
        components: form.components,
        gpgKey: form.gpgKey,
      });
      setForm((current) => ({
        ...current,
        name: "",
        url: "",
        components: "",
        gpgKey: "",
      }));
    });

  const toggle = (repo: Repository) =>
    run(() => setRepositoryEnabled(repo.id, !repo.enabled));

  const remove = (repo: Repository) => run(() => removeRepository(repo.id));

  const managerLabel =
    info?.manager === "apt"
      ? "APT"
      : info?.manager === "dnf"
        ? "DNF"
        : info?.manager === "pacman"
          ? "Pacman"
          : "—";

  const managerHint = info
    ? t("repositories.list.hint", {
        manager: managerLabel,
        distro: info.distro || t("repositories.unknownDistro"),
      })
    : "";

  return (
    <>
      <PageHeader
        title={t("repositories.title")}
        subtitle={t("repositories.subtitle")}
        action={
          <Button
            variant="ghost"
            icon={RefreshCw}
            busy={busy || acting}
            onClick={() => void load()}
            aria-label={t("repositories.refresh")}
            title={t("repositories.refresh")}
          />
        }
      />

      {!allowed && <Notice>{t("common.systemChangesDisabled")}</Notice>}
      {error && <Notice>{error}</Notice>}

      {!info ? (
        !error && <Loading text={t("repositories.loading")} />
      ) : info.manager === "none" ? (
        <Empty icon={Package} text={t("common.unsupportedSystem")} />
      ) : (
        <>
          {info.manager === "pacman" && <Notice>{t("repositories.pacmanHint")}</Notice>}

          <Card title={t("repositories.list.title")} hint={managerHint}>
            {info.repositories.length === 0 ? (
              <Empty icon={Package} text={t("repositories.empty")} />
            ) : (
              <ul className="list repo-list">
                {info.repositories.map((repo) => (
                  <li key={repo.id} className="repo-row">
                    <div className="grow">
                      <div className="row gap repo-title">
                        <span className="repo-name">{repo.name}</span>
                        <span className={`chip ${repo.enabled ? "" : "muted"}`}>
                          {repo.enabled ? t("repositories.enabled") : t("repositories.disabled")}
                        </span>
                        {repo.managed && <span className="chip">{t("repositories.managed")}</span>}
                      </div>
                      {repo.url && <span className="muted small block ellipsis">{repo.url}</span>}
                      <span className="muted small block">
                        {repo.source}
                        {repo.details ? ` · ${repo.details}` : ""}
                      </span>
                    </div>

                    <div className="row gap repo-actions">
                      {info.manager !== "pacman" && (
                        <Button
                          variant="ghost"
                          icon={repo.enabled ? PowerOff : Power}
                          disabled={!allowed || acting}
                          onClick={() => void toggle(repo)}
                        >
                          {repo.enabled ? t("repositories.disable") : t("repositories.enable")}
                        </Button>
                      )}
                      <ConfirmButton
                        label={t("repositories.remove")}
                        confirmLabel={t("repositories.removeConfirm")}
                        icon={Trash2}
                        iconOnly
                        disabled={!allowed || acting}
                        busy={acting}
                        onConfirm={() => void remove(repo)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("repositories.add.title")} hint={t("repositories.add.hint")}>
            <div className="repo-form">
              <label className="field col">
                <span>{t("repositories.add.name")}</span>
                <input
                  className="text-input"
                  value={form.name}
                  placeholder={t("repositories.add.namePlaceholder")}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </label>
              <label className="field col">
                <span>{t("repositories.add.url")}</span>
                <input
                  className="text-input"
                  value={form.url}
                  placeholder="https://"
                  onChange={(e) => updateField("url", e.target.value)}
                />
              </label>

              {info.manager === "apt" && (
                <>
                  <label className="field col">
                    <span>{t("repositories.add.suite")}</span>
                    <input
                      className="text-input"
                      value={form.suite}
                      placeholder="noble"
                      onChange={(e) => updateField("suite", e.target.value)}
                    />
                  </label>
                  <label className="field col">
                    <span>{t("repositories.add.components")}</span>
                    <input
                      className="text-input"
                      value={form.components}
                      placeholder="main"
                      onChange={(e) => updateField("components", e.target.value)}
                    />
                  </label>
                </>
              )}

              {info.manager === "dnf" && (
                <label className="field col">
                  <span>{t("repositories.add.gpgKey")}</span>
                  <input
                    className="text-input"
                    value={form.gpgKey}
                    placeholder="https://"
                    onChange={(e) => updateField("gpgKey", e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="repo-add-foot">
              <span className="muted small">{t("repositories.add.rootHint")}</span>
              <Button
                icon={Plus}
                busy={acting}
                disabled={!allowed || !form.name.trim() || !form.url.trim()}
                onClick={() => void add()}
              >
                {t("repositories.add.submit")}
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
