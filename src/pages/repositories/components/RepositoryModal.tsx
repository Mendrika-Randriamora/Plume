import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button, Notice } from "@/core/ui";
import type { AddRepositoryInput, PackageManager, Repository } from "../api";

interface Props {
  mode: "add" | "edit";
  isOpen: boolean;
  onClose: () => void;
  manager: PackageManager;
  codename: string | null;
  allowed: boolean;
  repository?: Repository | null;
  onSubmit: (input: AddRepositoryInput) => Promise<string | null>;
}

interface Form {
  name: string;
  url: string;
  suite: string;
  components: string;
  gpgKey: string;
}

const emptyForm = (codename: string | null): Form => ({
  name: "",
  url: "",
  suite: codename ?? "",
  components: "",
  gpgKey: "",
});

const formFrom = (repository: Repository): Form => ({
  name: repository.name,
  url: repository.url,
  suite: repository.suite,
  components: repository.components,
  gpgKey: repository.gpgKey,
});

export function RepositoryModal({
  mode,
  isOpen,
  onClose,
  manager,
  codename,
  allowed,
  repository,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form>(() =>
    mode === "edit" && repository ? formFrom(repository) : emptyForm(codename),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Le formulaire repart des valeurs courantes à chaque ouverture.
  useEffect(() => {
    if (!isOpen) return;
    setForm(mode === "edit" && repository ? formFrom(repository) : emptyForm(codename));
    setError(null);
    setBusy(false);
  }, [isOpen, mode, repository, codename]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (key: keyof Form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !form.name.trim() || !form.url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const message = await onSubmit({
        name: form.name,
        url: form.url,
        suite: form.suite,
        components: form.components,
        gpgKey: form.gpgKey,
      });
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };

  // Le nom d'un dépôt APT est sa suite, et celui d'un dépôt Pacman son nom de
  // section : ces deux valeurs ne se modifient pas ici.
  const showName = mode === "add" || manager === "dnf";

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t(mode === "add" ? "repositories.add.title" : "repositories.edit.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{t(mode === "add" ? "repositories.add.title" : "repositories.edit.title")}</h2>
          <Button
            variant="ghost"
            icon={X}
            disabled={busy}
            onClick={close}
            aria-label={t("common.close")}
          />
        </header>

        <form className="modal-content" onSubmit={(event) => void submit(event)}>
          <p className="muted small">
            {t(mode === "add" ? "repositories.add.hint" : "repositories.edit.hint")}
          </p>

          <div className="repo-form">
            {showName && (
              <label className="field col">
                <span>{t("repositories.add.name")}</span>
                <input
                  className="text-input"
                  value={form.name}
                  placeholder={t("repositories.add.namePlaceholder")}
                  autoFocus={mode === "add"}
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
            )}
            <label className="field col">
              <span>{t("repositories.add.url")}</span>
              <input
                className="text-input"
                value={form.url}
                placeholder="https://"
                autoFocus={mode === "edit" && !showName}
                onChange={(event) => update("url", event.target.value)}
              />
            </label>

            {manager === "apt" && (
              <>
                <label className="field col">
                  <span>{t("repositories.add.suite")}</span>
                  <input
                    className="text-input"
                    value={form.suite}
                    placeholder="noble"
                    onChange={(event) => update("suite", event.target.value)}
                  />
                </label>
                <label className="field col">
                  <span>{t("repositories.add.components")}</span>
                  <input
                    className="text-input"
                    value={form.components}
                    placeholder="main"
                    onChange={(event) => update("components", event.target.value)}
                  />
                </label>
              </>
            )}

            {manager === "dnf" && (
              <label className="field col">
                <span>{t("repositories.add.gpgKey")}</span>
                <input
                  className="text-input"
                  value={form.gpgKey}
                  placeholder="https://"
                  onChange={(event) => update("gpgKey", event.target.value)}
                />
              </label>
            )}
          </div>

          {error && <Notice>{error}</Notice>}

          <div className="repo-add-foot">
            <span className="muted small">{t("repositories.add.rootHint")}</span>
            <div className="row gap">
              <Button variant="ghost" type="button" disabled={busy} onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                icon={Plus}
                busy={busy}
                disabled={!allowed || !form.name.trim() || !form.url.trim()}
              >
                {t(mode === "add" ? "repositories.add.submit" : "repositories.edit.submit")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
