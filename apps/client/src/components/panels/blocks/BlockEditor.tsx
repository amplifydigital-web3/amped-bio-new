/* eslint-disable @typescript-eslint/ban-ts-comment */
import { X } from "lucide-react";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { Button } from "../../ui/Button";
import { BlockType, LinkBlock } from "@/api/api.types";
import { extractUsernameFromUrl, getPlatformName, getPlatformUrl } from "@/utils/platforms";
import { z } from "zod";
import { Resolver, SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LinkFormInputs, linkFormSchema } from "./LinkForm";
import { useCallback, useMemo } from "react";
import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";

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
const mediaBlockSchema = z
  .object({
    url: z.string().min(1, "URL is required"),
    label: z.string().optional().default(""),
    content: z.string().optional(),
    platform: z.string(),
  })
  .refine(
    data => {
      if (data.platform === "youtube") {
        return isValidYouTubeUrl(data.url);
      } else if (data.platform === "instagram") {
        return isValidInstagramUrl(data.url);
      } else if (data.platform === "twitter" || data.platform === "x") {
        return isValidXUrl(data.url);
      } else if (data.platform === "spotify") {
        return isValidSpotifyUrl(data.url);
      }

      return true;
    },
    {
      message: "Please enter a valid URL for this platform",
      path: ["url"],
    }
  );

const textBlockSchema = z.object({
  content: z.string().min(1, "Content is required").trim(),
});

const linkBlockSchema = linkFormSchema;

// Dynamic schema based on block type
const createBlockSchema = (blockType: string) => {
  if (blockType === "text") {
    return textBlockSchema;
  } else if (blockType === "media") {
    return mediaBlockSchema;
  }

  return linkBlockSchema;
};

interface BlockEditorProps {
  block: BlockType;
  onSave: (block: BlockType["config"]) => void;
  onCancel: () => void;
}

export function BlockEditor({ block, onSave, onCancel }: BlockEditorProps) {
  const blockSchema = useMemo(() => createBlockSchema(block.type), [block.type]);

  console.info("BlockEditor", block.type, block.config);

  // For link blocks, extract username from url if it exists
  const initialValues = useMemo(() => {
    if (block.type === "link" && block.config.url && block.config.platform) {
      const values = { ...block.config };
      const username = extractUsernameFromUrl(block.config.platform, block.config.url);
      if (username) {
        values.url = username;
      }
      return values;
    }

    // Add proper initial values for text blocks
    if (block.type === "text") {
      return {
        content: block.config.content || "",
      };
    }

    return block.config;
  }, [block.config, block.type]);

  // Create a type based on union of possible schemas
  type BlockFormData =
    | z.infer<typeof textBlockSchema>
    | z.infer<typeof mediaBlockSchema>
    | z.infer<typeof linkBlockSchema>;

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BlockFormData>({
    // @ts-expect-error
    resolver: zodResolver(blockSchema) as Resolver<BlockFormData>,
    defaultValues: initialValues,
    mode: "onChange",
  });

  const onSubmit: SubmitHandler<BlockFormData> = useCallback(
    (data: BlockFormData) => {
      console.log("Submitted data:", data);
      console.log("Block type:", block.type);

      // For link blocks, ensure we have the correct URL based on platform/username
      if (block.type === "link") {
        const typedConfig = data as LinkBlock["config"];
        // Only modify URL if we have both platform and username
        if (typedConfig.platform && typedConfig.platform !== "custom") {
          typedConfig.url = getPlatformUrl(typedConfig.platform, typedConfig.url);
        }

        onSave(typedConfig);
      } else {
        console.log("Saving non-link block:", data);
        onSave(data as BlockType["config"]);
      }
    },
    [block.type, onSave]
  );

  return (
    <div className="fixed top-0 left-0 w-screen h-screen overflow-y-auto bg-black/50 flex items-center justify-center z-50 outline-none">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Edit{" "}
            {block.type === "media"
              ? getPlatformName(block.config.platform)
              : block.type === "link"
                ? "Link"
                : "Text"}{" "}
            Block
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
                // @ts-ignore
                error={errors.url?.message?.toString()}
                {...register("url")}
              />
              {/* Hidden input to ensure platform is included in form data */}
              <input type="hidden" {...register("platform")} value={block.config.platform} />
              {block.config.content !== undefined && (
                <Textarea
                  label="Content"
                  placeholder="Enter additional content"
                  rows={4}
                  // @ts-ignore
                  error={errors.content?.message?.toString()}
                  {...register("content")}
                />
              )}
            </>
          )}

          {block.type === "text" && (
            <>
              <SlateEditor
              initialValue={block.config.content}
                // @ts-ignore
                error={errors.content?.message?.toString()}
                onSave={e => setValue("content", e)}
              />
              <input type="hidden" {...register("content")} value={watch('content')} />
            </>
          )}

          <div className="flex justify-end space-x-3">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
