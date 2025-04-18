import { useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { Button } from "@/components/ui/Button";
import { redeemOnelink } from "@/api/api";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import { normalizeOnelink, formatOnelink, cleanOnelinkInput } from "@/utils/onelink";

export function URLPicker() {
  // Extract onelink without @ symbol if it exists using our utility function
  const profile = useEditorStore(state => state.profile);
  const currentOnelink = normalizeOnelink(profile.onelink || "");
  const currentOnelinkFormatted = profile.onelinkFormatted || formatOnelink(profile.onelink || "");

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

    // Apply our formatOnelink utility to ensure @ prefix for formatted version
    // and normalized version without @ prefix
    const formattedURL = formatOnelink(value);
    const normalizedURL = normalizeOnelink(value);

    try {
      // Call the API to update the onelink - with normalized value (without @ symbol)
      const response = await redeemOnelink(normalizedURL);

      if (response.success) {
        // Show success toast
        toast.success("URL updated successfully!");

        // Update local state on success with both versions
        setProfile({
          ...profile,
          onelink: normalizedURL,
          onelinkFormatted: formattedURL,
        });

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
      toast.error("Failed to update URL. Please try again");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-1">Your Public URL</h3>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <div className="flex items-center">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-l-md border-y border-l border-gray-300">
              amped-bio.com/@
            </div>
            <input
              type="text"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              className={`flex-1 px-3 py-2 border rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                urlStatus === "Invalid" || urlStatus === "TooShort"
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="your-unique-url"
            />
          </div>

          {/* Status indicator */}
          <div className="absolute right-3 top-2">
            <URLStatusIndicator status={urlStatus} isCurrentUrl={isCurrentUrl} />
          </div>
        </div>

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
