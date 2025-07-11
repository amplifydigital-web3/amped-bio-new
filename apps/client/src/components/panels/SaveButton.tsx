import { useEditor } from "../../contexts/EditorContext";

const SaveButton = () => {
  const { changes, themeChanges, saveChanges } = useEditor();

  if (!changes && !themeChanges) {
    // Show when there are either block changes or theme changes
    return null;
  }

  const handleSave = () => {
    saveChanges();
  };

  return (
    <div style={{ marginRight: "16px" }}>
      <button
        onClick={handleSave}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Save Changes
      </button>
    </div>
  );
};

export default SaveButton;
