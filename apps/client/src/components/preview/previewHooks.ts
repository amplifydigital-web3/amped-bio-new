import { useEditor } from "@/contexts/EditorContext";

/** The editor's preview theme, with any hovered Design option applied (006 I11). */
export function usePreviewTheme() {
  const { theme, previewOverride } = useEditor();
  return previewOverride
    ? { ...theme, config: { ...theme.config, ...previewOverride.config } }
    : theme;
}

/** Preview clicks open the block in the Page list; on Design they do nothing (006 I05). */
export function usePreviewBlockSelect(onSelected?: () => void) {
  const { activePanel, selectBlock } = useEditor();
  if (activePanel !== "page") return undefined;
  return (id: number) => {
    selectBlock(id);
    onSelected?.();
  };
}
