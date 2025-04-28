import { X } from "lucide-react";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { Button } from "../../ui/Button";
import { BlockType } from "@/api/api.types";
import { getPlatformName, getPlatformUrl } from "@/utils/platforms";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { extractUsernameFromUrl, LinkFormInputs } from "./LinkForm";

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

// Create Zod schemas for validation
const mediaBlockSchema = z.object({
  url: z.string().min(1, "URL is required"),
  label: z.string().optional(),
  content: z.string().optional(),
  platform: z.string(),
});

const textBlockSchema = z.object({
  content: z.string().min(1, "Content is required"),
  platform: z.string().optional(),
});

// Dynamic schema based on block type
const createBlockSchema = (blockType: string, platform?: string) => {
  if (blockType === "text") {
    return textBlockSchema;
  } else if (blockType === "media") {
    return mediaBlockSchema.refine(
      data => {
        if (!data.url) return true;

        if (platform === "youtube") {
          return isValidYouTubeUrl(data.url);
        } else if (platform === "instagram") {
          return isValidInstagramUrl(data.url);
        } else if (platform === "twitter" || platform === "x") {
          return isValidXUrl(data.url);
        } else if (platform === "spotify") {
          return isValidSpotifyUrl(data.url);
        }

        return true;
      },
      {
        message: "Please enter a valid URL for this platform",
        path: ["url"],
      }
    );
  }

  return z.object({});
};

interface BlockEditorProps {
  block: BlockType;
  onSave: (block: BlockType["config"]) => void;
  onCancel: () => void;
}

export function BlockEditor({ block, onSave, onCancel }: BlockEditorProps) {
  const blockSchema = createBlockSchema(
    block.type,
    block.type === "media" ? block.config.platform : undefined
  );

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(blockSchema),
    defaultValues: block.config as any,
  });

  const onSubmit = (data: any) => {
    console.log("Submitted data:", data);

    if (block.type === "link") {
      data.url = getPlatformUrl(block.config.platform, data.username);
    }

    onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Edit {block.type === "media" ? getPlatformName(block.config.platform) : "Text"} Block
          </h3>
          <button onClick={onCancel} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {block.type === "link" && (
            <LinkFormInputs register={register} errors={errors} watch={watch} setValue={setValue} />
          )}

          {block.type === "media" && (
            <>
              <Input
                label="URL"
                type="url"
                placeholder="Enter media URL"
                error={errors.url?.message?.toString()}
                {...register("url")}
              />
              <Input
                label="Label"
                type="text"
                placeholder="Enter a label (optional)"
                error={errors.label?.message?.toString()}
                {...register("label")}
              />
              {block.config.content !== undefined && (
                <Textarea
                  label="Content"
                  placeholder="Enter additional content"
                  rows={4}
                  error={errors.content?.message?.toString()}
                  {...register("content")}
                />
              )}
            </>
          )}
          {block.type === "text" && (
            <Textarea
              label="Content"
              placeholder="Enter your text content"
              rows={4}
              error={errors.content?.message?.toString()}
              {...register("content")}
            />
          )}

          <div className="flex justify-end space-x-3">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
