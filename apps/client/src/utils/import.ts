import type { EditorState } from "../types/editor";
import { useEditorStore } from "../store/editorStore";

export async function importSettings(file: File): Promise<void> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as EditorState;

    // Validate the imported data structure
    if (!data.profile || !data.blocks || !data.theme) {
      throw new Error("Invalid settings file format");
    }

    // Get the store actions
    const store = useEditorStore.getState();

    // Update all store values
    store.setProfile(data.profile);
    store.reorderBlocks(data.blocks);
    store.updateThemeConfig(data.theme.config);
    store.setActivePanel(data.activePanel);

    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}
