import React, { useEffect, useState } from 'react';
import { ProfileForm } from './ProfileForm';
import { ImageUploader } from './ImageUploader';
import { TwitterImport } from './TwitterImport';
import { useEditorStore } from '../../../store/editorStore';
import type { UserProfile } from '../../../types/editor';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { checkOnelinkAvailability } from '@/api'
import { useNavigate } from 'react-router-dom'

export function ProfilePanel() {
  const [url, setUrl] = useState('');
  const [urlStatus, setUrlStatus] = useState('Unknown');
  const profile = useEditorStore((state) => state.profile);
  const setProfile = useEditorStore((state) => state.setProfile);
  const saveChanges = useEditorStore((state) => state.saveChanges);
  const nav = useNavigate();

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  const handleURLUpdate = (value: string) => {
    setProfile({ ...profile, onelink: value });
    saveChanges();
    nav(`/${value}/edit`);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setUrlStatus('Unknown');
  };

  const handleUrlCheck = () => {
    setUrlStatus('Checking...');
    checkOnelinkAvailability(url).then((res) => {
      setUrlStatus(res);
    });
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
        imageUrl={profile.photoUrl || ''}
        onImageChange={(url) => handleProfileUpdate('photoUrl', url)}
      />

      <ProfileForm
        profile={profile}
        onUpdate={handleProfileUpdate}
      />

      <div className="border-t border-gray-200 my-4" />

      <div className="space-y-2">
        <h3 className="text-m font-semibold text-gray-900">Unique Amped-Bio URL</h3>
        <p className="text-sm text-gray-500">
          Choose a unique string that will be used in your public profile link. Use the 'Check Availability' button to see if your desired URL is available.
        </p>

        <Input
          label="Amped-Bio URL"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder={profile.onelink || 'Your unique URL'}
        />

        <div className="flex justify-between">
          <Button
            size='sm'
            onClick={() => handleUrlCheck()}
          >
            Check Availability
          </Button>

          {urlStatus !== 'Unknown' && (
            <Button
              variant={urlStatus === 'Available' ? 'confirm' : 'outline'}
              size='sm'
              disabled={urlStatus !== 'Available'}
              onClick={() => handleURLUpdate(url)}
            >
              {url === profile.onelink && 'Your URL'}
              {url !== profile.onelink && {
                Available: 'Use this URL',
                Taken: 'Unavailable',
              }[urlStatus]}

            </Button>)
          }
        </div>
      </div>
    </div>
  );
}