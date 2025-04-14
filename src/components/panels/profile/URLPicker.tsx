import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { Button } from '@/components/ui/Button';
import { checkOnelinkAvailability, redeemOnelink } from '@/api/api';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function URLPicker() {
  // Extract onelink without @ symbol if it exists
  const profile = useEditorStore(state => state.profile);
  const currentOnelink = profile.onelink?.startsWith('@')
    ? profile.onelink.substring(1)
    : profile.onelink || '';

  const [url, setUrl] = useState(currentOnelink);
  const [urlStatus, setUrlStatus] = useState<
    'Unknown' | 'Checking...' | 'Available' | 'Unavailable' | 'Invalid'
  >('Unknown');
  const setProfile = useEditorStore(state => state.setProfile);
  const saveChanges = useEditorStore(state => state.saveChanges);
  const nav = useNavigate();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Updated regex to only allow alphanumeric characters, hyphens, and underscores
  const urlRegex = /^[a-zA-Z0-9_-]+$/;
  const isValid = urlRegex.test(url);

  // Effect for debounced URL checking
  useEffect(() => {
    if (url.trim() === '') {
      setUrlStatus('Unknown');
      return;
    }

    if (!isValid) {
      setUrlStatus('Invalid');
      return;
    }

    // Check if URL is the same as current onelink
    if (url === currentOnelink) {
      setUrlStatus('Unknown'); // Use 'Unknown' status but we'll handle display separately
      return;
    }

    setUrlStatus('Checking...');

    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set a new timer
    debounceTimer.current = setTimeout(() => {
      // Don't send the @ symbol in the request
      checkOnelinkAvailability(url).then(available => {
        setUrlStatus(available ? 'Available' : 'Unavailable');
      });
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [url, isValid, currentOnelink]);

  // Function to handle URL update with async/await
  const handleURLUpdate = async (value: string) => {
    // Don't proceed if already updating
    if (isUpdating) return;

    setIsUpdating(true);

    // Store with @ symbol for compatibility with existing code
    const atURL = `@${value}`;

    try {
      // Call the API to update the onelink - without @ symbol
      const response = await redeemOnelink(value);

      if (response.success) {
        // Show success toast
        toast.success('URL updated successfully!');

        // Update local state on success
        setProfile({ ...profile, onelink: atURL });
        setUrlStatus('Unknown');
        saveChanges();

        // Navigate to the new URL
        nav(`/${atURL}/edit`);
      } else {
        // Handle unsuccessful response
        console.error('Failed to update onelink:', response.message);
        toast.error(`Failed to update URL: ${response.message}`);
      }
    } catch (error) {
      // Handle errors
      console.error('Error updating onelink:', error);

      // Display error message with toast
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error('An unexpected error occurred');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUrlChange = (value: string) => {
    // Remove @ symbol if user enters it manually
    const cleanValue = value.startsWith('@') ? value.substring(1) : value;

    // Only allow valid characters
    const validChars = cleanValue.replace(/[^a-zA-Z0-9_-]/g, '');
    setUrl(validChars);
  };

  // Helper function to render status indicator with Lucide icons
  const renderStatusIndicator = () => {
    // Special case: URL is the same as current onelink
    if (url === currentOnelink && url !== '') {
      return (
        <div className="flex items-center text-blue-600 whitespace-nowrap">
          <CheckCircle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span>Current handle</span>
        </div>
      );
    }

    switch (urlStatus) {
      case 'Checking...':
        return (
          <div className="flex items-center text-amber-500 whitespace-nowrap">
            <Loader2 className="w-4 h-4 mr-2 animate-spin flex-shrink-0" />
            <span>Checking...</span>
          </div>
        );
      case 'Available':
        return (
          <div className="flex items-center text-green-600 whitespace-nowrap">
            <CheckCircle className="w-4 h-4 mr-1 flex-shrink-0" />
            <span>Available</span>
          </div>
        );
      case 'Unavailable':
        return (
          <div className="flex items-center text-red-600 whitespace-nowrap">
            <XCircle className="w-4 h-4 mr-1 flex-shrink-0" />
            <span>Unavailable</span>
          </div>
        );
      case 'Invalid':
        return (
          <div className="flex items-center text-red-600 whitespace-nowrap">
            <XCircle className="w-4 h-4 mr-1 flex-shrink-0" />
            <span>Invalid</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3 p-4 bg-white rounded-lg shadow-sm border border-gray-100">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Unique Amped-Bio URL</h3>
        <p className="text-sm text-gray-500 mt-1">
          Choose a unique string that will be used in your public profile link.
        </p>
      </div>

      <div className="relative mt-2">
        <div className="flex items-center">
          <div className="bg-gray-100 flex items-center justify-center h-10 px-3 rounded-l-md border border-r-0 border-gray-300 text-gray-500">
            @
          </div>
          <div className="relative flex-grow">
            <input
              type="text"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder={currentOnelink || 'Your unique URL'}
              pattern="^[a-zA-Z0-9_-]+$"
              className="w-full px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-32"
              aria-label="URL slug"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 min-w-[90px] text-right">
              {renderStatusIndicator()}
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-1">
          Your URL will be:{' '}
          <span className="font-medium">amped-bio.com/@{url || currentOnelink || 'your-url'}</span>
        </p>
      </div>

      <div className="flex justify-between items-center">
        <div>
          {url !== '' && !isValid && (
            <p className="text-xs text-red-600">
              URLs can only contain letters, numbers, hyphens, and underscores.
            </p>
          )}
        </div>

        {urlStatus === 'Available' && (
          <Button
            variant="confirm"
            size="sm"
            disabled={!isValid || url === currentOnelink || isUpdating}
            onClick={() => handleURLUpdate(url)}
            className="transition-all duration-200 transform hover:scale-105"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Use this URL'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
