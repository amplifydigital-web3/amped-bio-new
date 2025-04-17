import { useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { Button } from "@/components/ui/Button";
import { redeemOnelink } from "@/api/api";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import {
  normalizeOnelink,
  formatOnelink,
  cleanOnelinkInput,
  getOnelinkPublicUrl,
} from "@/utils/onelink";

export function URLPicker() {
  // Extract onelink without @ symbol if it exists using our utility function
  const profile = useEditorStore(state => state.profile);
  const currentOnelink = normalizeOnelink(profile.onelink || "");

  const [url, setUrl] = useState(currentOnelink);
  const [isUpdating, setIsUpdating] = useState(false);

  // Use our custom hook for URL validation and availability checking
  const { urlStatus, isValid, isCurrentUrl } = useOnelinkAvailability(url, currentOnelink);

  const setProfile = useEditorStore(state => state.setProfile);
  const saveChanges = useEditorStore(state => state.saveChanges);
  const nav = useNavigate();

  const handleUrlChange = (value: string) => {
    // Use our central utility function to clean the input
    const cleanValue = cleanOnelinkInput(value);
    setUrl(cleanValue);
  };

  // Function to handle URL update with async/await
  const handleURLUpdate = async (value: string) => {
    // Don't proceed if already updating
    if (isUpdating) return;

    setIsUpdating(true);

    // Apply our formatOnelink utility to ensure @ prefix
    const formattedURL = formatOnelink(value);

    try {
      // Call the API to update the onelink - with normalized value (without @ symbol)
      const response = await redeemOnelink(normalizeOnelink(value));

      if (response.success) {
        // Show success toast
        toast.success("URL updated successfully!");

        // Update local state on success
        setProfile({ ...profile, onelink: formattedURL });
        saveChanges();

        // Navigate to the new URL
        nav(`/${formattedURL}/edit`);
      } else {
        // Handle unsuccessful response
        console.error("Failed to update onelink:", response.message);
        toast.error(`Failed to update URL: ${response.message}`);
      }
    } catch (error) {
      // Handle errors
      console.error("Error updating onelink:", error);

      // Display error message with toast
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error("An unexpected error occurred");
      }
    } finally {
      setIsUpdating(false);
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
              placeholder={currentOnelink || "Your unique URL"}
              className="w-full px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-32"
              aria-label="URL slug"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 min-w-[90px] text-right">
              <URLStatusIndicator status={urlStatus} isCurrentUrl={isCurrentUrl} />
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-1">
          Your URL will be:{" "}
          <span className="font-medium">
            {getOnelinkPublicUrl(url || currentOnelink || "your-url")}
          </span>
        </p>
      </div>

      <div className="flex justify-between items-center">
        <div>
          {url !== "" && !isValid && (
            <p className="text-xs text-red-600">
              URLs can only contain letters, numbers, hyphens, and underscores.
            </p>
          )}
        </div>

        {urlStatus === "Available" && (
          <Button
            variant="confirm"
            size="sm"
            disabled={!isValid || isCurrentUrl || isUpdating}
            onClick={() => handleURLUpdate(url)}
            className="transition-all duration-200 transform hover:scale-105"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Use this URL"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
