import React from 'react';
import { ProfileForm } from './ProfileForm';
import { ImageUploader } from './ImageUploader';
import { TwitterImport } from './TwitterImport';
import { useEditorStore } from '../../../store/editorStore';
import type { UserProfile } from '../../../types/editor';

export function ProfilePanel() {
  const profile = useEditorStore((state) => state.profile);
  const setProfile = useEditorStore((state) => state.setProfile);

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  // const handleTwitterImport = (importedProfile: Partial<UserProfile>) => {
  //   setProfile({ ...profile, ...importedProfile });
  // };

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <p className="text-sm text-gray-500">
          Customize your profile information and appearance
        </p>
      </div>

      {/* <TwitterImport onProfileUpdate={handleTwitterImport} /> */}

      {/* <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-2 bg-white text-sm text-gray-500">or add manually</span>
        </div>
      </div> */}

      <ImageUploader
        imageUrl={profile.photoUrl}
        onImageChange={(url) => handleProfileUpdate('photoUrl', url)}
      />

      <ProfileForm
        profile={profile}
        onUpdate={handleProfileUpdate}
      />
    </div>
  );
}