import { useTranslation } from "react-i18next";
import { openPorterCredit } from "../api";

interface Props {
  onError: (message: string) => void;
}

/** Crédit discret, en bas de page ; le lien s'ouvre dans le navigateur externe. */
export function Credit({ onError }: Props) {
  const { t } = useTranslation();

  return (
    <p className="porter-credit">
      {t("porter.credit.prefix")}{" "}
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          void openPorterCredit().catch((error) => onError((error as Error).message));
        }}
      >
        {t("porter.credit.link")}
      </a>
    </p>
  );
}
