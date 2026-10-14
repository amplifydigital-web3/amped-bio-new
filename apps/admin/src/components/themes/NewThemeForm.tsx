import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { useNavigate, Link } from "react-router";
import { ChevronLeft, Image as ImageIcon, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Input,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  downloadMediaFromUrl,
  generateVideoThumbnailFromUrl,
  importThemeConfigFromJson,
  trpc,
} from "@repo/ui";
import { CopyButton } from "../../kit/CopyButton";
import { FieldError, Spinner } from "../../kit/parts";
import { ThemeThumbnailSelector } from "./ThemeThumbnailSelector";
import {
  backgroundLimitsLine,
  uploadThemeBackground,
  uploadThemeThumbnail,
  validateBackgroundFile,
} from "./uploads";

// Screen Review 088 I02 and I03. New theme on its own page: one G1 clear card,
// 508 wide, fields in one column with labels above, errors under each field
// on blur, and Create theme. A partial create (the theme exists but a media
// upload failed) opens the theme's Edit dialog naming what is missing.

const schema = z.object({
  name: z.string().trim().min(1, "Add a name.").max(100, "Use up to 100 characters."),
  description: z.string().max(500, "Use up to 500 characters."),
  categoryId: z
    .number({ invalid_type_error: "Choose a collection." })
    .min(1, "Choose a collection."),
});

type Errors = Partial<
  Record<"name" | "description" | "categoryId" | "thumbnail" | "background", string>
>;

// Thumbnail from the imported background, at 75% quality
async function thumbnailFromImageUrl(url: string): Promise<File | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const type = blob.type || "image/jpeg";
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.75));
    return out ? new File([out], "theme-background.jpg", { type }) : null;
  } catch {
    return null;
  }
}

async function thumbnailFromVideoUrl(url: string): Promise<File | null> {
  try {
    const result = await generateVideoThumbnailFromUrl(url, {
      width: 400,
      height: 300,
      quality: 0.75,
      timeStamp: 1,
      format: "image/jpeg",
    });
    return result?.file ?? null;
  } catch {
    return null;
  }
}

interface ImportSummary {
  fileName: string;
  background: string;
  thumbnail: string;
  backgroundUrl?: string;
}

export function NewThemeForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: limits } = useQuery(trpc.admin.upload.getLimits.queryOptions());
  const { data: categories } = useQuery(trpc.admin.themes.getThemeCategories.queryOptions());
  const createTheme = useMutation(trpc.admin.themes.createTheme.mutationOptions());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [background, setBackground] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const importRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);

  const checkField = (field: "name" | "description" | "categoryId") => {
    const value = field === "name" ? name : field === "description" ? description : categoryId;
    const result = schema.shape[field].safeParse(value);
    setErrors(e => ({
      ...e,
      [field]: result.success ? undefined : result.error.errors[0]?.message,
    }));
  };

  const clearImport = useCallback(() => {
    setSummary(null);
    setConfig({});
    setBackground(null);
    setThumbnail(null);
  }, []);

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const themeConfig = await importThemeConfigFromJson(file);
      const baseName = file.name
        .replace(/\.ampedtheme$/, "")
        .replace(/[^a-zA-Z]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setConfig(themeConfig as Record<string, unknown>);
      if (baseName) setName(baseName);

      const next: ImportSummary = {
        fileName: file.name,
        background: "Not included",
        thumbnail: "Not included",
      };
      const url = themeConfig.background?.value;
      const kind = themeConfig.background?.type as "image" | "video" | undefined;
      if (url && (kind === "image" || kind === "video")) {
        next.backgroundUrl = url;
        const extension = url.split(".").pop()?.toLowerCase() ?? "";
        const fallback = kind === "video" ? "mp4" : "jpg";
        const valid =
          kind === "video" ? ["mp4", "mov", "avi", "webm"] : ["jpg", "jpeg", "png", "svg"];
        const fileName = `background_${baseName || "theme"}_${Date.now()}.${valid.includes(extension) ? extension : fallback}`;
        try {
          const downloaded = await downloadMediaFromUrl(url, fileName, kind);
          const problem = downloaded ? validateBackgroundFile(downloaded, limits) : "missing";
          if (downloaded && !problem) {
            setBackground(downloaded);
            next.background = downloaded.name;
          } else {
            next.background = "Did not download";
          }
        } catch {
          next.background = "Did not download";
        }
        const thumb =
          kind === "image" ? await thumbnailFromImageUrl(url) : await thumbnailFromVideoUrl(url);
        if (thumb) {
          setThumbnail(thumb);
          next.thumbnail = "Made from the background";
        }
      }
      setSummary(next);
      toast.success("Theme file imported");
    } catch {
      toast.error("This file is not a theme file. Choose an .ampedtheme file.");
    } finally {
      setImporting(false);
    }
  };

  const onBackground = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateBackgroundFile(file, limits);
    setErrors(e => ({ ...e, background: problem }));
    if (!problem) setBackground(file);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse({ name, description, categoryId });
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.errors) next[issue.path[0] as keyof Errors] = issue.message;
    }
    if (!thumbnail) next.thumbnail = "Thumbnail is required.";
    setErrors(next);
    if (!parsed.success || !thumbnail) {
      const first = Object.keys(next)[0];
      document
        .querySelector<HTMLElement>(
          `[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] button`
        )
        ?.focus();
      return;
    }

    setCreating(true);
    try {
      const theme = await createTheme.mutateAsync({
        name: parsed.data.name,
        description: parsed.data.description,
        category_id: parsed.data.categoryId,
        config,
        share_config: {},
      });
      const missing: string[] = [];
      if (background) {
        try {
          await uploadThemeBackground(theme.id, background);
        } catch {
          missing.push("background");
        }
      }
      try {
        await uploadThemeThumbnail(theme.id, thumbnail);
      } catch {
        missing.push("thumbnail");
      }
      void queryClient.invalidateQueries({ queryKey: trpc.admin.themes.getThemes.queryKey() });
      if (missing.length === 0) {
        toast.success("Theme created");
        navigate("/themes?tab=themes");
      } else {
        // 088 I03: open the new theme's Edit with a notice naming the missing media
        navigate(`/themes?tab=themes&edit=${theme.id}&missing=${missing.join(",")}`, {
          state: { name: parsed.data.name, description: parsed.data.description },
        });
      }
    } catch {
      toast.error("The theme was not created", {
        duration: Infinity,
        action: { label: "Retry", onClick: () => document.getElementById("create-theme")?.click() },
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="prism-glass-clear mx-auto w-full max-w-[508px] space-y-5 !rounded-prism-21 p-5 font-prism sm:p-8"
    >
      <Link
        to="/themes?tab=themes"
        className="prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 pr-3 text-prism-label font-semibold text-prism-nav"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />
        Back to themes
      </Link>

      <div className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Import theme file</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => importRef.current?.click()}
          disabled={importing}
          aria-busy={importing || undefined}
        >
          {importing ? <Spinner /> : <Upload aria-hidden />}
          Import .ampedtheme file
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".ampedtheme"
          className="hidden"
          onChange={onImport}
        />
        {summary && (
          <>
            <dl className="prism-slab divide-y divide-prism-line">
              {[
                ["Configuration", summary.fileName],
                ["Background", summary.background],
                ["Thumbnail", summary.thumbnail],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-h-touch items-center justify-between gap-4 px-4"
                >
                  <dt className="text-prism-label text-prism-ink-2">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-prism-label text-prism-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {summary.background === "Did not download" && summary.backgroundUrl && (
              <Notice variant="warning" title="The background did not download">
                <p className="text-prism-meta">
                  Download it from its address, then select it under Background.
                </p>
                <span className="mt-1 flex items-center gap-1">
                  <span className="min-w-0 truncate font-prism-mono text-prism-code-sm">
                    {summary.backgroundUrl}
                  </span>
                  <CopyButton
                    value={summary.backgroundUrl}
                    label="Copy background address"
                    size="inline"
                  />
                </span>
              </Notice>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={clearImport}>
              Clear import
            </Button>
          </>
        )}
      </div>

      <div data-field="name">
        <Input
          label="Name (Required)"
          value={name}
          maxLength={100}
          onChange={event => setName(event.target.value)}
          onBlur={() => checkField("name")}
          error={errors.name}
        />
      </div>
      <div data-field="description">
        <Textarea
          label="Description"
          value={description}
          rows={3}
          maxLength={500}
          onChange={event => setDescription(event.target.value)}
          onBlur={() => checkField("description")}
          error={errors.description}
        />
      </div>
      <div data-field="categoryId" className="space-y-2">
        <p id="theme-collection-label" className="text-prism-label font-semibold text-prism-ink">
          Collection <span className="font-normal text-prism-ink-2">(Required)</span>
        </p>
        <Select
          value={categoryId ? String(categoryId) : undefined}
          onValueChange={value => {
            setCategoryId(Number(value));
            setErrors(e => ({ ...e, categoryId: undefined }));
          }}
        >
          <SelectTrigger
            aria-labelledby="theme-collection-label"
            aria-invalid={errors.categoryId ? true : undefined}
            onBlur={() => checkField("categoryId")}
          >
            <SelectValue placeholder="Choose a collection" />
          </SelectTrigger>
          <SelectContent>
            {categories?.map(category => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError>{errors.categoryId}</FieldError>
      </div>

      <div data-field="background" className="space-y-2">
        <p className="text-prism-label font-semibold text-prism-ink">Background</p>
        <div className="prism-well flex flex-col items-center gap-2 !rounded-prism-21 px-4 py-5 text-center">
          <ImageIcon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
          {background && (
            <p className="max-w-full truncate text-prism-label font-semibold text-prism-ink">
              {background.name}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => backgroundRef.current?.click()}
            >
              {background ? "Change file" : "Select file"}
            </Button>
            {background && (
              <Button type="button" variant="ghost" onClick={() => setBackground(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <input
          ref={backgroundRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,.jpg,.jpeg,.png,.svg,.mp4,.mov,.avi,.webm"
          onChange={onBackground}
        />
        {errors.background ? (
          <FieldError>{errors.background}</FieldError>
        ) : (
          <p className="text-prism-meta text-prism-ink-2">{backgroundLimitsLine(limits)}</p>
        )}
      </div>

      <div data-field="thumbnail">
        <ThemeThumbnailSelector
          selectedFile={thumbnail}
          onFileSelect={file => {
            setThumbnail(file);
            if (file) setErrors(e => ({ ...e, thumbnail: undefined }));
          }}
          onError={message => setErrors(e => ({ ...e, thumbnail: message }))}
          error={errors.thumbnail}
        />
      </div>

      <Button
        id="create-theme"
        type="submit"
        size="lg"
        className="w-full"
        disabled={creating}
        aria-busy={creating || undefined}
      >
        {creating && <Spinner className="border-white/40 border-t-white" />}
        Create theme
      </Button>
    </form>
  );
}
