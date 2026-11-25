import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, Power, PowerOff, RefreshCw, Trash2, Button, Card, ConfirmButton, Empty, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import {
  addRepository,
  listRepositories,
  removeRepository,
  setRepositoryEnabled,
  updateRepository,
} from "./api";
import type { AddRepositoryInput, Repository, RepositoryInfo } from "./api";
import { RepositoryModal } from "./components/RepositoryModal";

type ModalState = { mode: "add" } | { mode: "edit"; repository: Repository } | null;

export function RepositoriesPage() {
  const { t } = useTranslation();
  const allowed = usePermission("systemChanges");
  const [info, setInfo] = useState<RepositoryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const next = await listRepositories();
      setInfo(next);
      setError(null);
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

  const submit = async (input: AddRepositoryInput): Promise<string | null> => {
    if (!modal) return null;
    setActing(true);
    setError(null);
    try {
      if (modal.mode === "edit") {
        await updateRepository({ id: modal.repository.id, ...input });
      } else {
        await addRepository(input);
      }
      await load();
      setModal(null);
      return null;
    } catch (e) {
      return message((e as Error).message);
    } finally {
      setActing(false);
    }
  };

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
          <div className="row gap">
            <Button
              variant="ghost"
              icon={RefreshCw}
              busy={busy || acting}
              onClick={() => void load()}
              title={t("repositories.refresh")}>
              {t("repositories.refresh")}
            </Button>
            {info?.manager !== "none" && (
              <Button
                icon={Plus}
                disabled={!allowed || acting || !info}
                onClick={() => setModal({ mode: "add" })}
              >
                {t("repositories.add.open")}
              </Button>
            )}
          </div>
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
                    <div
                      className={`grow repo-main${allowed ? " editable" : ""}`}
                      onDoubleClick={
                        allowed ? () => setModal({ mode: "edit", repository: repo }) : undefined
                      }
                      title={allowed ? t("repositories.edit.doubleClick") : undefined}
                    >
                      <div className="row gap repo-title">
                        <a
                          className="repo-name repo-link"
                          href="#"
                          onClick={(event) => event.preventDefault()}
                        >
                          {repo.name}
                        </a>
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
        </>
      )}

      <RepositoryModal
        mode={modal?.mode ?? "add"}
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        manager={info?.manager ?? "none"}
        codename={info?.codename ?? null}
        allowed={allowed}
        repository={modal?.mode === "edit" ? modal.repository : null}
        onSubmit={submit}
      />
    </>
  );
}
