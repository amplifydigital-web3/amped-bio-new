import React from "react";
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

// Zod schema for form validation with dynamic validation based on platform
// eslint-disable-next-line react-refresh/only-export-components
export const linkFormSchema = z
  .object({
    platform: z.string().min(1, "Platform is required"),
    url: z.string().min(1, "This field is required"),
    label: z.string().min(1, "Label is required"),
  })
  .superRefine((data, ctx) => {
    const platform = data.platform;
    const url = data.url;

    if (platform === "email") {
      // Email validation using Zod's built-in email validator
      if (!z.string().email().safeParse(url).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid email address",
          path: ["url"],
        });
      }
    } else if (platform === "custom" || platform === "document") {
      // URL validation for custom and document platforms
      try {
        new URL(url);
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid URL",
          path: ["url"],
        });
      }
    } else if (platform && platform !== "") {
      // Username validation for social platforms
      if (!/^[a-zA-Z0-9._-]*$/.test(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Username can only contain letters, numbers, dots, hyphens, and underscores",
          path: ["url"],
        });
      }
    }
  });

type FormData = z.infer<typeof linkFormSchema>;

// Abstract component for the link form inputs
interface LinkFormInputsProps {
  register: any;
  errors: any;
  watch: any;
  setValue: any;
}

export function LinkFormInputs({ register, errors, watch, setValue }: LinkFormInputsProps) {
  const platform = watch("platform") as PlatformId | "";

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as PlatformId;
    setValue("platform", value);
    setValue("url", "");
  };

  const getUrlFieldLabel = () => {
    if (!platform) return "URL";
    if (platform === "email") return "Email Address";
    if (platform === "document") return "Document URL";
    if (platform === "custom") return "URL";
    return "Username";
  };

  const getUrlFieldType = () => {
    if (platform === "email") return "email";
    if (platform === "custom" || platform === "document") return "url";
    return "text";
  };

  const getUrlFieldPlaceholder = () => {
    if (platform === "email") return "your@email.com";
    if (platform === "custom" || platform === "document") return "https://example.com";
    return "username";
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

      {platform &&
        (platform === "custom" || platform === "email" || platform === "document" ? (
          <Input
            label={getUrlFieldLabel()}
            type={getUrlFieldType()}
            placeholder={getUrlFieldPlaceholder()}
            error={errors.url?.message?.toString()}
            {...register("url")}
          />
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">{getUrlFieldLabel()}</label>
            <div
              className={`flex items-center border rounded-md overflow-hidden ${
                errors.url ? "border-red-500" : "border-gray-300"
              }`}
            >
              <span className="bg-gray-100 px-3 py-2 text-gray-500 text-sm border-r">
                {getPlatformUrl(platform as PlatformId, "").replace("{{username}}", "")}
              </span>
              <input
                type="text"
                {...register("url")}
                className={`flex-grow px-3 py-2 focus:outline-none ${errors.url ? "bg-red-50" : ""}`}
                placeholder="username"
              />
            </div>
            {errors.url && <p className="text-red-500 text-xs mt-1">{errors.url.message}</p>}
          </div>
        ))}

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
      url: "",
      label: "",
    },
  });

  const onSubmit = (data: FormData) => {
    const platform = data.platform as PlatformId;
    let finalUrl = data.url;

    // For social platforms, construct the full URL
    if (platform && platform !== "custom" && platform !== "email" && platform !== "document") {
      finalUrl = getPlatformUrl(platform, data.url);
    }

    // For email platform, add mailto: prefix if not present
    if (platform === "email" && !finalUrl.startsWith("mailto:")) {
      finalUrl = `mailto:${finalUrl}`;
    }

    onAdd({
      id: 0,
      type: "link",
      order: 0,
      config: {
        platform,
        url: finalUrl,
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
