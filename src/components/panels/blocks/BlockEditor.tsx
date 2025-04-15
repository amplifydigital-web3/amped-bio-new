import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { Button } from "../../ui/Button";
import { BlockType, MediaBlock } from "@/api/api.types";

// Helper function to validate YouTube URLs
const isValidYouTubeUrl = (url: string): boolean => {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/).+/;
  return youtubeRegex.test(url);
};

// Helper function to validate Instagram URLs
const isValidInstagramUrl = (url: string): boolean => {
  const instagramRegex = /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?/;
  return instagramRegex.test(url);
};

// Helper function to validate X.com (Twitter) URLs
const isValidXUrl = (url: string): boolean => {
  const xRegex = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
  return xRegex.test(url);
};

// Helper function to validate Spotify URLs
const isValidSpotifyUrl = (url: string): boolean => {
  const spotifyRegex =
    /^(https?:\/\/)?(open\.spotify\.com)\/(track|album|playlist|show|episode)\/[a-zA-Z0-9]+(\?si=[a-zA-Z0-9]+)?/;
  return spotifyRegex.test(url);
};

interface BlockEditorProps {
  block: BlockType;
  onSave: (block: BlockType["config"]) => void;
  onCancel: () => void;
}

export function BlockEditor({ block, onSave, onCancel }: BlockEditorProps) {
  const [config, setConfig] = useState(block.config);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (url: string) => {
    if (!url) return true;

    if (block.type === "media") {
      const mediaBlock = block as MediaBlock;

      if (mediaBlock.config.platform === "youtube") {
        if (!isValidYouTubeUrl(url)) {
          setUrlError("Please enter a valid YouTube video or Shorts URL");
          return false;
        }
      } else if (mediaBlock.config.platform === "instagram") {
        if (!isValidInstagramUrl(url)) {
          setUrlError("Please enter a valid Instagram post, reel, or TV URL");
          return false;
        }
      } else if (mediaBlock.config.platform === "twitter") {
        if (!isValidXUrl(url)) {
          setUrlError("Please enter a valid X.com or Twitter post URL");
          return false;
        }
      } else if (mediaBlock.config.platform === "spotify") {
        if (!isValidSpotifyUrl(url)) {
          setUrlError("Please enter a valid Spotify track, album, playlist, show, or episode URL");
          return false;
        }
      }
    }

    setUrlError(null);
    return true;
  };

  const handleUrlChange = (url: string) => {
    setConfig({ ...config, url } as MediaBlock["config"]);
    validateUrl(url);
  };

  const handleSave = () => {
    if (
      block.type === "media" &&
      (config.platform === "youtube" ||
        config.platform === "instagram" ||
        config.platform === "twitter" ||
        config.platform === "x" ||
        config.platform === "spotify")
    ) {
      if (!validateUrl(config.url || "")) {
        return;
      }
    }
    onSave(config);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Edit {block.type === "media" ? block.config.platform : "Text"} Block
          </h3>
          <button onClick={onCancel} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {block.type === "media" && (
            <>
              <Input
                label="URL"
                type="url"
                defaultValue={block.config.url || ""}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="Enter media URL"
                error={urlError}
              />
              <Input
                label="Label"
                type="text"
                defaultValue={block.config.label || ""}
                onChange={e => setConfig({ ...config, label: e.target.value })}
                placeholder="Enter a label (optional)"
              />
              {block.config.content !== undefined && (
                <Textarea
                  label="Content"
                  defaultValue={block.config.content || ""}
                  onChange={e => setConfig({ ...config, content: e.target.value })}
                  placeholder="Enter additional content"
                  rows={4}
                />
              )}
            </>
          )}
          {block.type === "text" && (
            <Textarea
              label="Content"
              defaultValue={block.config.content || ""}
              onChange={e => {
                setConfig({ ...config, content: e.target.value });
              }}
              placeholder="Enter your text content"
              rows={4}
            />
          )}

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
