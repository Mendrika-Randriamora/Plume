import { FileText, Folder } from "lucide-react";
import { ago, bytes } from "@/core/format";
import type { FileEntry } from "../types";

interface Props {
  files: FileEntry[];
  showDate?: boolean;
  onOpen: (f: FileEntry) => void;
}

/** Liste cliquable : un clic ouvre directement le dossier du fichier. */
export function FileList({ files, showDate, onOpen }: Props) {
  return (
    <ul className="list">
      {files.map((f) => (
        <li key={f.path}>
          <button className="list-row" onClick={() => onOpen(f)} title={f.path}>
            {f.isDir ? <Folder size={16} strokeWidth={1.75} /> : <FileText size={16} strokeWidth={1.75} />}
            <span className="grow">
              <span className="ellipsis">{f.name}</span>
              <span className="muted small ellipsis">{f.parent}</span>
            </span>
            <span className="muted small nowrap">{showDate ? ago(f.lastUsed) : ""}</span>
            <span className="nowrap">{bytes(f.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
