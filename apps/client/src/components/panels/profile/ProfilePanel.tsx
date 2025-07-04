import { useState, useRef } from "react";
import { ProfileForm } from "./ProfileForm";
import { ImageUploader } from "./ImageUploader";
import { useEditorStore } from "../../../store/editorStore";
import { URLPicker } from "./URLPicker";
import { Download, Upload, AlertTriangle } from "lucide-react";

export function ProfilePanel() {
  const profile = useEditorStore(state => state.profile);
  const theme = useEditorStore(state => state.theme);
  const setProfile = useEditorStore(state => state.setProfile);
  const exportTheme = useEditorStore(state => state.exportTheme);
  const importTheme = useEditorStore(state => state.importTheme);
  const [activeTab, setActiveTab] = useState("general");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if theme is from server (user_id = null)
  const isServerTheme = theme.user_id === null;

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  const handleExportTheme = () => {
    const filename = prompt("Enter a name for your theme file:", "My Theme");
    if (filename !== null) {
      // User clicked OK (filename could be empty string or actual value)
      const cleanFilename = (filename.trim() || "My Theme").replace(/\s+/g, "-");
      exportTheme(cleanFilename);
    }
    // If user clicked Cancel, do nothing
  };

  const handleImportTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importTheme(file);
      // Reset the input value to allow importing the same file again
      e.target.value = "";
    } catch (error) {
      console.error("Failed to import theme configuration:", error);
      alert("Failed to import theme configuration. Please check the file format.");
    }
  };

  return (
    <div className="flex flex-col">
      {/* Navigation Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4 px-6 py-3">
          <button
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "general"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "photo"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("photo")}
          >
            Profile Photo
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "url"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("url")}
          >
            URL Settings
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "theme"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("theme")}
          >
            Theme Management
          </button>
        </nav>
      </div>

      <div className="p-6 space-y-8">
        {activeTab === "general" && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
              <p className="text-sm text-gray-500">
                Customize your profile information and appearance
              </p>
            </div>

            <ProfileForm profile={profile} onUpdate={handleProfileUpdate} />
          </>
        )}

        {activeTab === "photo" && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">Profile Photo</h2>
              <p className="text-sm text-gray-500">Upload or update your profile photo</p>
            </div>

            <ImageUploader
              imageUrl={profile.photoUrl || ""}
              onImageChange={url => handleProfileUpdate("photoUrl", url)}
            />
          </>
        )}

        {activeTab === "url" && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">URL Settings</h2>
              <p className="text-sm text-gray-500">Configure your profile URL</p>
            </div>

            <URLPicker />
          </>
        )}

        {activeTab === "theme" && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">Theme Management</h2>
              <p className="text-sm text-gray-500">Export or import your theme configuration</p>
              <a
                href="https://amplifydigital.freshdesk.com/support/solutions/articles/154000227742-how-to-export-and-import-themes-in-amped-bio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-blue-600 hover:underline"
              >
                How to export and import themes (Knowledge Base)
              </a>
            </div>

            {isServerTheme && (
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-orange-800">Protected Theme</h3>
                  <p className="text-sm text-orange-700 mt-1">
                    You're currently using another user's theme. You cannot export this theme or
                    import a new theme over it. To use these features, you must first create your
                    own theme or select a personal theme from your collection.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                <h3 className="font-medium text-gray-900">Export Theme Configuration</h3>
                <p className="text-sm text-gray-500">
                  Download your current theme configuration as an AmpedTheme file (.ampedtheme)
                </p>
                <button
                  onClick={handleExportTheme}
                  disabled={isServerTheme}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                    isServerTheme
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-500 text-white hover:bg-blue-600"
                  }`}
                >
                  <Download size={16} />
                  <span>Export Configuration</span>
                </button>
                {isServerTheme && (
                  <p className="text-xs text-gray-500">
                    Export is disabled while using a server theme
                  </p>
                )}
              </div>

              <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                <h3 className="font-medium text-gray-900">Import Theme Configuration</h3>
                <p className="text-sm text-gray-500">
                  Upload an AmpedTheme configuration file (.ampedtheme) to apply it to your profile
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportTheme}
                  accept=".ampedtheme"
                  className="hidden"
                  disabled={isServerTheme}
                />
                <button
                  onClick={() => !isServerTheme && fileInputRef.current?.click()}
                  disabled={isServerTheme}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                    isServerTheme
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-500 text-white hover:bg-blue-600"
                  }`}
                >
                  <Upload size={16} />
                  <span>Import Configuration</span>
                </button>
                {isServerTheme && (
                  <p className="text-xs text-gray-500">
                    Import is disabled while using a server theme
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
