import type { EditorState } from "../types/editor";

interface EditorActions {
  setProfile: (profile: any) => void;
  reorderBlocks: (blocks: any[]) => void;
  updateThemeConfig: (config: any) => void;
  setActivePanel: (panel: string) => void;
}

export async function importSettings(file: File, editorActions: EditorActions): Promise<void> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as EditorState;

    // Validate the imported data structure
    if (!data.profile || !data.blocks || !data.theme) {
      throw new Error("Invalid settings file format");
    }

    // Update all values using the provided actions
    editorActions.setProfile(data.profile);
    editorActions.reorderBlocks(data.blocks);
    editorActions.updateThemeConfig(data.theme.config);
    editorActions.setActivePanel(data.activePanel);

    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}
