import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Notice,
  Textarea,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FieldError } from "../../kit/parts";
import { ThemeThumbnailSelector } from "./ThemeThumbnailSelector";
import {
  backgroundLimitsLine,
  uploadThemeBackground,
  uploadThemeThumbnail,
  validateBackgroundFile,
} from "./uploads";

// Screen Review 088 I06 and I03. Edit theme on the shared Dialog: Title and
// Description, Save changes enabled only when a value differs. After a
// partial create it also carries the missing media with an info notice that
// names it, and the missing field is focused.

export interface EditableTheme {
  id: number;
  name: string;
  description?: string | null;
}

export type MissingMedia = "thumbnail" | "background";

function missingSentence(missing: MissingMedia[]) {
  if (missing.length === 2)
    return "Theme created. The background and thumbnail did not upload. Add them here.";
  return `Theme created. The ${missing[0]} did not upload. Add it here.`;
}

export function EditThemeDialog({
  theme,
  missing = [],
  onClose,
  onSuccess,
}: {
  theme: EditableTheme | null;
  missing?: MissingMedia[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    thumbnail?: string;
    background?: string;
    form?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const backgroundButtonRef = useRef<HTMLButtonElement>(null);
  const { data: limits } = useQuery(trpc.admin.upload.getLimits.queryOptions());

  useEffect(() => {
    if (!theme) return;
    setName(theme.name ?? "");
    setDescription(theme.description ?? "");
    setThumbnail(null);
    setBackground(null);
    setErrors({});
  }, [theme]);

  useEffect(() => {
    if (theme && missing[0] === "background") {
      setTimeout(() => backgroundButtonRef.current?.focus(), 50);
    }
  }, [theme, missing]);

  if (!theme) return null;
  const textChanged =
    name.trim() !== (theme.name ?? "") || description.trim() !== (theme.description ?? "");
  const dirty = textChanged || !!thumbnail || !!background;

  const save = async () => {
    if (!name.trim()) {
      setErrors({ name: "Add a title." });
      return;
    }
    setSaving(true);
    try {
      if (textChanged) {
        await trpcClient.admin.themes.updateTheme.mutate({
          id: theme.id,
          name: name.trim(),
          description: description.trim(),
        });
      }
      if (background) await uploadThemeBackground(theme.id, background);
      if (thumbnail) await uploadThemeThumbnail(theme.id, thumbnail);
      toast.success("Theme updated");
      onSuccess();
      onClose();
    } catch {
      setErrors({ form: "The changes did not save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {theme.name || "theme"}</DialogTitle>
        </DialogHeader>
        {missing.length > 0 && <Notice variant="info">{missingSentence(missing)}</Notice>}
        <form
          noValidate
          className="space-y-5"
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            label="Title"
            value={name}
            maxLength={100}
            onChange={event => setName(event.target.value)}
            onBlur={() =>
              setErrors(e => ({ ...e, name: name.trim() ? undefined : "Add a title." }))
            }
            error={errors.name}
          />
          <Textarea
            label="Description"
            value={description}
            rows={3}
            maxLength={500}
            onChange={event => setDescription(event.target.value)}
          />
          {missing.includes("background") && (
            <div className="space-y-2">
              <p className="text-prism-label font-semibold text-prism-ink">Background</p>
              <div className="prism-well flex items-center gap-3 px-3 py-2">
                <ImageIcon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
                <span className="min-w-0 flex-1 truncate text-prism-label text-prism-ink">
                  {background?.name ?? "No file yet"}
                </span>
                <Button
                  ref={backgroundButtonRef}
                  type="button"
                  variant="secondary"
                  onClick={() => backgroundRef.current?.click()}
                >
                  Select file
                </Button>
              </div>
              <input
                ref={backgroundRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,.jpg,.jpeg,.png,.svg,.mp4,.mov,.avi,.webm"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const problem = validateBackgroundFile(file, limits);
                  setErrors(e => ({ ...e, background: problem }));
                  if (!problem) setBackground(file);
                }}
              />
              {errors.background ? (
                <FieldError>{errors.background}</FieldError>
              ) : (
                <p className="text-prism-meta text-prism-ink-2">{backgroundLimitsLine(limits)}</p>
              )}
            </div>
          )}
          {missing.includes("thumbnail") && (
            <ThemeThumbnailSelector
              selectedFile={thumbnail}
              onFileSelect={setThumbnail}
              onError={message => setErrors(e => ({ ...e, thumbnail: message }))}
              error={errors.thumbnail}
              autoFocus={missing[0] === "thumbnail"}
            />
          )}
          {errors.form && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              {errors.form}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
