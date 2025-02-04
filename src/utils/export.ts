import type { EditorState } from '../types/editor';

export function exportSettings(state: Partial<EditorState>) {
  // Create a Blob containing the JSON data
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });

  // Create a temporary URL for the Blob
  const url = URL.createObjectURL(blob);

  // Create a temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = 'link-in-bio-settings.json';

  // Trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}