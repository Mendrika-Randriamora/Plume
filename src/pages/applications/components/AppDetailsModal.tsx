import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Loading } from "@/core/ui";
import { bytes } from "@/core/format";
import type { ApplicationDetails } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fetchDetails: () => Promise<ApplicationDetails | null>;
}

export function AppDetailsModal({ isOpen, onClose, fetchDetails }: Props) {
  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchDetails().then((d) => {
        setDetails(d);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    }
  }, [isOpen, fetchDetails]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Détails de l'application</h2>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label="Fermer" />
        </header>
        
        {loading ? (
          <Loading text="Chargement des détails..." />
        ) : details ? (
          <div className="modal-content">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Nom</span>
                <span className="detail-value">{details.name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Nom du paquet</span>
                <span className="detail-value muted">{details.package_name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Source</span>
                <span className="detail-value">{details.source}</span>
              </div>
              {details.version && (
                <div className="detail-item">
                  <span className="detail-label">Version</span>
                  <span className="detail-value">{details.version}</span>
                </div>
              )}
              {details.size !== null && (
                <div className="detail-item">
                  <span className="detail-label">Taille</span>
                  <span className="detail-value">{bytes(details.size)}</span>
                </div>
              )}
              {details.description && (
                <div className="detail-item full-width">
                  <span className="detail-label">Description</span>
                  <span className="detail-value">{details.description}</span>
                </div>
              )}
              {details.exec && (
                <div className="detail-item full-width">
                  <span className="detail-label">Commande d'exécution</span>
                  <span className="detail-value muted">{details.exec}</span>
                </div>
              )}
              {details.icon && (
                <div className="detail-item">
                  <span className="detail-label">Icône</span>
                  <span className="detail-value muted">{details.icon}</span>
                </div>
              )}
              {details.categories && details.categories.length > 0 && (
                <div className="detail-item full-width">
                  <span className="detail-label">Catégories</span>
                  <span className="detail-value">
                    {details.categories.map((c, i) => (
                      <span key={i}>
                        {i > 0 ? ", " : ""}
                        {c}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {details.desktop_file && (
                <div className="detail-item full-width">
                  <span className="detail-label">Fichier .desktop</span>
                  <span className="detail-value muted">{details.desktop_file}</span>
                </div>
              )}
            </div>
            
            {details.desktop_content && (
              <div className="desktop-content">
                <h3>Contenu du fichier .desktop</h3>
                <pre className="desktop-pre">{details.desktop_content}</pre>
              </div>
            )}
          </div>
        ) : (
          <div className="empty">
            <p>Impossible de charger les détails de l'application.</p>
          </div>
        )}
      </div>
    </div>
  );
}
