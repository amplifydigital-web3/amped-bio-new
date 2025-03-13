import { useState } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { checkOnelinkAvailability } from '@/api'
import { useNavigate } from 'react-router-dom'

export function URLPicker() {
    const [url, setUrl] = useState('');
    const [urlStatus, setUrlStatus] = useState('Unknown');
    const profile = useEditorStore((state) => state.profile);
    const setProfile = useEditorStore((state) => state.setProfile);
    const saveChanges = useEditorStore((state) => state.saveChanges);
    const nav = useNavigate();

    // eslint-disable-next-line no-useless-escape
    const urlRegex = /^[a-zA-Z0-9._~!$&\(\)*+,;=:@%\-]+$/;
    const isValid = urlRegex.test(url);

    const handleURLUpdate = (value: string) => {
        const atURL = `@${value}`;
        setProfile({ ...profile, onelink: atURL });
        setUrlStatus('Unknown');
        saveChanges();
        nav(`/${atURL}/edit`);
    };

    const handleUrlChange = (value: string) => {
        setUrl(value);
        setUrlStatus('Unknown');
    };

    const handleUrlCheck = () => {
        setUrlStatus('Checking...');

        if (!isValid) {
            setUrlStatus('Invalid');
            return;
        }
        const atURL = `@${url}`;
        checkOnelinkAvailability(atURL).then((res) => {
            setUrlStatus(res);
        });
    };

    return (
        <div className="space-y-2">
            <h3 className="text-m font-semibold text-gray-900">Unique Amped-Bio URL</h3>
            <p className="text-sm text-gray-500">
                Choose a unique string that will be used in your public profile link. Use the 'Check Availability' button to see if your desired URL is available.
            </p>

            <Input
                label="Amped-Bio URL"
                leftText='@'
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={profile.onelink || 'Your unique URL'}
                pattern="^[a-zA-Z0-9._~!$&\(\)*+,;=:@%\-]+$"
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
                        disabled={!isValid || urlStatus !== 'Available' || url === profile.onelink}
                        onClick={() => handleURLUpdate(url)}
                    >
                        {(url === profile.onelink || url === '') && 'Your URL'}
                        {url !== profile.onelink && url !== '' && {
                            Available: 'Use this URL',
                            Taken: 'Unavailable',
                            Invalid: 'Invalid'
                        }[urlStatus]}

                    </Button>)
                }
            </div>
            {url !== '' && !isValid && (
                <p className="text-sm text-red-600">URLs can only contain letters, numbers, and the following characters: . _ ~ ! $ & ( ) * + , ; = : @ % -</p>
            )}
        </div>
    );
}