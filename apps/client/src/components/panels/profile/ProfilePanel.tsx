import { useState, useRef } from "react";
import { ProfileForm } from "./ProfileForm";
import { ImageUploader } from "./ImageUploader";
import { useEditorStore } from "../../../store/editorStore";
import { URLPicker } from "./URLPicker";
import { Download, Upload } from "lucide-react";
import { EmailChangeDialog } from "@/components/dialogs/EmailChangeDialog";
import { useAuthStore } from "@/store/authStore";

export function ProfilePanel() {
  const profile = useEditorStore(state => state.profile);
  const setProfile = useEditorStore(state => state.setProfile);
  const exportTheme = useEditorStore(state => state.exportTheme);
  const importTheme = useEditorStore(state => state.importTheme);
  const [activeTab, setActiveTab] = useState("general");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { authUser } = useAuthStore();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  const handleExportTheme = () => {
    exportTheme();
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
              activeTab === "account"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("account")}
          >
            Account
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

            {/* Profile Photo Uploader - already here */}
            <ImageUploader
              imageUrl={profile.photoUrl || ""}
              onImageChange={url => handleProfileUpdate("photoUrl", url)}
            />

            {/* Name and Bio Form, with URL settings input below name */}
            <div className="space-y-6">
              <ProfileForm profile={profile} onUpdate={handleProfileUpdate} />
              {/* URL input and info box with no extra spacing */}
              <div>
                <URLPicker />
                {/* The info box is rendered by URLPicker, so no extra spacing here */}
              </div>
            </div>
          </>
        )}
        {activeTab === "account" && authUser && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-medium text-gray-800 mb-4">Profile Details</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <div className="flex items-center mt-1">
                    <p className="text-base font-medium text-gray-900">{authUser.email}</p>
                    <button
                      onClick={() => setIsEmailDialogOpen(true)}
                      className="ml-3 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Change
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Account ID</p>
                  <p className="mt-1 text-base font-medium text-gray-900">{authUser.id}</p>
                </div>
              </div>
            </div>
            <EmailChangeDialog
              isOpen={isEmailDialogOpen}
              onClose={() => setIsEmailDialogOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
