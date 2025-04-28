import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { PlatformId, getPlatformUrl, platforms } from "@/utils/platforms";
import { LinkBlock } from "@/api/api.types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";

interface LinkFormProps {
  onAdd: (block: LinkBlock) => void;
}

// Zod schema for form validation
const linkFormSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  username: z
    .string()
    .optional()
    .refine(
      val => !val || /^[a-zA-Z0-9._-]*$/.test(val),
      "Username can only contain letters, numbers, dots, hyphens, and underscores"
    ),
  url: z.string().min(1, "URL is required"),
  label: z.string().min(1, "Label is required"),
});

type FormData = z.infer<typeof linkFormSchema>;

// Utility function to extract username from URL
// eslint-disable-next-line react-refresh/only-export-components
export function extractUsernameFromUrl(platform: PlatformId, url: string): string | null {
  // Skip for custom and document platforms
  if (platform === "custom" || platform === "document") {
    return null;
  }

  // For email platform
  if (platform === "email" && url.startsWith("mailto:")) {
    const emailMatch = url.match(/mailto:(.*)/);
    if (emailMatch && emailMatch[1]) {
      return emailMatch[1];
    }
  }
  // For other platforms
  else {
    const platformUrlPattern = getPlatformUrl(platform, "").replace("{{username}}", "");
    if (url.startsWith(platformUrlPattern)) {
      return url.replace(platformUrlPattern, "");
    }
  }

  return null;
}

// Abstract component for the link form inputs
interface LinkFormInputsProps {
  register: any;
  errors: any;
  watch: any;
  setValue: any;
}

export function LinkFormInputs({ register, errors, watch, setValue }: LinkFormInputsProps) {
  const platform = watch("platform") as PlatformId | "";
  const username = watch("username");
  const url = watch("url");
  const firstLoad = React.useRef(true);

  // Extract username from URL on initial load if username is empty
  useEffect(() => {
    if (platform && url && firstLoad.current) {
      console.info("Extracting username from URL:", url);

      const extractedUsername = extractUsernameFromUrl(platform as PlatformId, url);
      if (extractedUsername) {
        setValue("username", extractedUsername);
        firstLoad.current = false;
      }
    }
  }, [platform, url, username, setValue]);

  // Update URL when username or platform changes (for non-custom platforms)
  useEffect(() => {
    if (platform && platform !== "custom" && username) {
      setValue("url", getPlatformUrl(platform as PlatformId, username));
    }
  }, [platform, username, setValue]);

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as PlatformId;
    setValue("platform", value);
    setValue("username", "");
    if (value === "custom") {
      setValue("url", "");
    }
  };

  return (
    <>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Platform</label>
        <select
          {...register("platform")}
          onChange={handlePlatformChange}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.platform ? "border-red-500" : "border-gray-300"
          }`}
        >
          <option value="">Select a platform</option>
          {platforms.map(platform => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </select>
        {errors.platform && <p className="text-red-500 text-xs mt-1">{errors.platform.message}</p>}
      </div>

      {platform === "custom" ? (
        <Input
          label="URL"
          type="url"
          placeholder="https://"
          error={errors.url?.message?.toString()}
          {...register("url")}
        />
      ) : platform === "email" ? (
        <Input
          label="Email Address"
          type="email"
          placeholder="your@email.com"
          error={errors.username?.message?.toString()}
          {...register("username")}
        />
      ) : platform ? (
        <div>
          <label className="block text-sm font-medium mb-1">
            {platform === "document" ? "Document URL" : "Username"}
          </label>
          <div
            className={`flex items-center border rounded-md overflow-hidden ${
              errors.username ? "border-red-500" : "border-gray-300"
            }`}
          >
            {platform !== "document" && (
              <span className="bg-gray-100 px-3 py-2 text-gray-500 text-sm border-r">
                {getPlatformUrl(platform as PlatformId, "").replace("{{username}}", "")}
              </span>
            )}
            <input
              type="text"
              {...register("username")}
              className={`flex-grow px-3 py-2 focus:outline-none ${errors.username ? "bg-red-50" : ""}`}
              placeholder={platform === "document" ? "https://example.com/doc" : "username"}
            />
          </div>
          {errors.username && (
            <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
          )}
        </div>
      ) : null}

      {/* Hidden URL field for non-custom platforms */}
      <input type="hidden" {...register("url")} />

      <Input
        label="Label"
        type="text"
        placeholder="Display text for your link"
        error={errors.label?.message?.toString()}
        {...register("label")}
      />
    </>
  );
}

export function LinkForm({ onAdd }: LinkFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: {
      platform: "",
      username: "",
      url: "",
      label: "",
    },
  });

  const onSubmit = (data: FormData) => {
    onAdd({
      id: 0,
      type: "link",
      order: 0,
      config: {
        platform: data.platform as PlatformId,
        url: data.url,
        label: data.label,
      },
    });

    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <LinkFormInputs register={register} errors={errors} watch={watch} setValue={setValue} />

      <Button type="submit" className="w-full flex items-center justify-center">
        <Plus className="w-4 h-4 mr-2" />
        Add Link
      </Button>
    </form>
  );
}
