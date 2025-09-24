import { useState, useEffect } from "react";
import { useEditor } from "../../../contexts/EditorContext";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import { normalizeOnelink, formatOnelink, cleanOnelinkInput } from "@/utils/onelink";
import { useAuth } from "@/contexts/AuthContext";
import { trpcClient } from "@/utils/trpc";

export function URLPicker() {
  // Extract profile data safely from the store
  const { profile, setProfile } = useEditor();

  // Safely extract and process onelink values with default fallbacks
  const currentOnelink = normalizeOnelink(profile?.onelink || "");

  // Initialize state with safe default values
  const [url, setUrl] = useState(currentOnelink || "");
  const [isUpdating, setIsUpdating] = useState(false);

  // Use our custom hook for URL validation and availability checking
  const { urlStatus, isValid, isCurrentUrl } = useOnelinkAvailability(url, currentOnelink);

  const { updateAuthUser } = useAuth();
  const nav = useNavigate();

  // Update local state if profile changes
  useEffect(() => {
    if (profile?.onelink) {
      setUrl(normalizeOnelink(profile.onelink));
    }
  }, [profile?.onelink]);

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
      const response = await trpcClient.onelink.redeem.mutate({ newOnelink: normalizedURL });

      if (response.success) {
        toast.success("URL updated successfully!");
        // Navigate to the new URL
        console.log("REDIRECTING USER TO THE NEW URL ====>", formattedURL);
        nav(`/${formattedURL}`);

        setTimeout(() => {
          // Update local state on success with both versions
          setProfile({
            ...profile,
            onelink: normalizedURL,
            onelinkFormatted: formattedURL,
          });

          updateAuthUser({
            onelink: normalizedURL,
          });
        }, 500);
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
    <div className="w-full bg-white rounded-md">
      <div className="space-y-2 mb-4">
        <h3 className="text-sm font-medium text-gray-700">Your Public URL</h3>
        <p className="text-xs text-gray-500">Choose a unique URL for your public profile</p>
      </div>

      <div className="flex flex-col">
        <div className="relative w-full">
          <div className="flex items-center w-full">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-l-md border-y border-l border-gray-300 text-sm whitespace-nowrap">
              amped.bio/@
            </div>
            <input
              type="text"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                urlStatus === "Invalid" || urlStatus === "TooShort"
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="your-unique-url"
            />
            {/* Status indicator positioned right inside input */}
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              {urlStatus && <URLStatusIndicator status={urlStatus} isCurrentUrl={isCurrentUrl} />}
            </div>
          </div>
        </div>

        {/* Validation message */}
        <div className="min-h-[20px]">
          {url !== "" && !isValid && (
            <p className="text-xs text-red-600">
              URLs can only contain letters, numbers, hyphens, and underscores.
            </p>
          )}
        </div>

        {/* Current URL display */}
        {isCurrentUrl && url !== "" && (
          <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded-md">
            This is your current URL
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-end">
          {urlStatus === "Available" && (
            <Button
              variant="confirm"
              size="sm"
              disabled={!isValid || isCurrentUrl || isUpdating}
              onClick={() => handleURLUpdate(url)}
              className="transition-all duration-200"
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
    </div>
  );
}
