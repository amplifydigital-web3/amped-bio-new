import { useState } from "react";
import { ProfileForm } from "./ProfileForm";
import { ImageUploader } from "./ImageUploader";
import { URLPicker } from "./URLPicker";
import { useEditor } from "../../../contexts/EditorContext";
import { useAuth } from "../../../contexts/AuthContext";
import { EmailChangeDialog } from "../../dialogs/EmailChangeDialog";
import useGetAllRegisteredNames from "@/hooks/rns/useGetAllRegisteredNames";
import { useAccount } from "wagmi";

export function GeneralTabContent() {
  const { profile, setProfile } = useEditor();
  const { authUser } = useAuth();
  const { address: accountAddress, isConnected } = useAccount();
  const { revoNames: revolutionNames, isFetching } = useGetAllRegisteredNames(
    accountAddress,
    isConnected
  );
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Profile Photo</h2>
        <p className="text-sm text-gray-500">Upload or update your profile photo</p>
      </div>

      <ImageUploader
        imageUrl={profile.photoUrl || ""}
        onImageChange={url => handleProfileUpdate("photoUrl", url)}
      />

      <hr className="my-6 border-gray-200" />

      <ProfileForm
        profile={profile}
        onUpdate={handleProfileUpdate}
        revoNames={revolutionNames}
        isRevoNameFetching={isFetching}
      />

      <hr className="my-6 border-gray-200" />

      {/* Email Section */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Email</p>
          <div className="flex items-center mt-1">
            <p className="text-base font-medium text-gray-900">
              {authUser?.email || profile.email}
            </p>
            <button
              onClick={() => setIsEmailDialogOpen(true)}
              className="ml-3 text-sm text-blue-600 hover:text-blue-800"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      <hr className="my-6 border-gray-200" />

      <URLPicker />

      {/* Email Change Dialog */}
      <EmailChangeDialog isOpen={isEmailDialogOpen} onClose={() => setIsEmailDialogOpen(false)} />
    </>
  );
}
