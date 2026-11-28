import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { loadLanguage } from "../language";

interface Props {
  value: string;
  language: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

/** Thème CodeMirror piloté par les variables CSS de Plume : clair, sombre et
 * couleur personnalisée suivent donc automatiquement les réglages. */
const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--panel)", color: "var(--ink)" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: 'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace',
    fontSize: "0.92em",
    lineHeight: "1.55",
  },
  ".cm-content": { caretColor: "var(--ink)", padding: "12px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--panel)",
    color: "var(--muted)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLine": { backgroundColor: "var(--cm-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--cm-active)", color: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--cm-selection)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)" },
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--ink)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--cm-selection)" },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--warn) 30%, transparent)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--cm-selection)",
    outline: "1px solid var(--line)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--hover)",
    border: "none",
    color: "var(--muted)",
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--cm-comment)", fontStyle: "italic" },
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "var(--cm-keyword)",
    fontWeight: "600",
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--cm-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--cm-number)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--cm-keyword)" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--cm-type)" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "var(--ink)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--cm-keyword)",
  },
  { tag: [tags.heading, tags.strong], fontWeight: "600", color: "var(--ink)" },
  { tag: [tags.link, tags.url], color: "var(--cm-string)", textDecoration: "underline" },
  { tag: [tags.invalid], color: "var(--danger)" },
  { tag: [tags.punctuation, tags.bracket], color: "var(--muted)" },
]);

export function ConfigEditor({ value, language, readOnly, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);
  const readOnlyRef = useRef(readOnly);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  valueRef.current = value;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        basicSetup,
        editorTheme,
        syntaxHighlighting(highlightStyle),
        EditorView.lineWrapping,
        readOnlyCompartment.current.of([
          EditorState.readOnly.of(readOnlyRef.current),
          EditorView.editable.of(!readOnlyRef.current),
        ]),
        languageCompartment.current.of([]),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.contentAttributes.of({
          spellcheck: "false",
          autocapitalize: "off",
          autocomplete: "off",
        }),
      ],
    });

    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Contenu remplacé depuis l'extérieur (ouverture d'un autre fichier).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let cancelled = false;

    view.dispatch({ effects: languageCompartment.current.reconfigure([]) });
    void loadLanguage(language).then((extension: Extension | null) => {
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: languageCompartment.current.reconfigure(extension ?? []),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return <div className="config-editor" ref={host} />;
}
