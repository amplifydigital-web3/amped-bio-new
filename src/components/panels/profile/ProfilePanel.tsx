import { useState } from "react";
import { ProfileForm } from "./ProfileForm";
import { ImageUploader } from "./ImageUploader";
import { useEditorStore } from "../../../store/editorStore";
import { URLPicker } from "./URLPicker";

export function ProfilePanel() {
  const profile = useEditorStore(state => state.profile);
  const setProfile = useEditorStore(state => state.setProfile);
  const [activeTab, setActiveTab] = useState("general");

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
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
      </div>
    </div>
  );
}
