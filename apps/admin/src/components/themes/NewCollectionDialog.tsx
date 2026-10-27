import { useEffect, useRef, useState } from "react";
import { z } from "zod";
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
  Textarea,
  trpc,
  trpcClient,
} from "@repo/ui";
import { ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES } from "@repo/constants";
import { FieldError } from "../../kit/parts";
import { imageLimitsLine, uploadCollectionImage, validateImageFile } from "./uploads";

// Screen Review 088 I07. New collection on the shared Dialog: Name, Title,
// Identifier (suggested from Name, editable, checked on blur), Description and
// Image. Create collection; the collection appears in the slab on create.

const IDENTIFIER_RULE = "Use lowercase letters, numbers and hyphens.";

const schema = z.object({
  name: z.string().trim().min(1, "Add a name.").max(50, "Use up to 50 characters."),
  title: z.string().trim().min(1, "Add a title.").max(100, "Use up to 100 characters."),
  category: z
    .string()
    .trim()
    .min(1, IDENTIFIER_RULE)
    .max(50, "Use up to 50 characters.")
    .regex(/^[a-z0-9-]+$/, IDENTIFIER_RULE),
  description: z.string().max(240, "Use up to 240 characters."),
});

type Field = keyof z.infer<typeof schema>;

const suggestIdentifier = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 50);

export function NewCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState({ name: "", title: "", category: "", description: "" });
  const [identifierEdited, setIdentifierEdited] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field | "image" | "form", string>>>({});
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const { data: limits } = useQuery(trpc.admin.upload.getLimits.queryOptions());

  useEffect(() => {
    if (!open) return;
    setValues({ name: "", title: "", category: "", description: "" });
    setIdentifierEdited(false);
    setImage(null);
    setErrors({});
  }, [open]);

  const set = (field: Field, value: string) =>
    setValues(v => ({
      ...v,
      [field]: value,
      ...(field === "name" && !identifierEdited ? { category: suggestIdentifier(value) } : {}),
    }));

  const check = (field: Field) => {
    const result = schema.shape[field].safeParse(values[field]);
    setErrors(e => ({
      ...e,
      [field]: result.success ? undefined : result.error.errors[0]?.message,
    }));
  };

  const create = async () => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.errors) next[issue.path[0] as Field] = issue.message;
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      const created = await trpcClient.admin.themes.createThemeCategory.mutate(parsed.data);
      let imageFailed = false;
      if (image) {
        try {
          await uploadCollectionImage(created.id, image);
        } catch {
          imageFailed = true;
        }
      }
      if (imageFailed) {
        toast.error("Collection created. The image did not upload. Use Change image to add it.");
      } else {
        toast.success("Collection created");
      }
      onCreated();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      setErrors(
        message.includes("exist") || message.includes("unique")
          ? { category: "This identifier is already used. Choose another." }
          : { form: "The collection was not created. Try again." }
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="space-y-5"
          onSubmit={event => {
            event.preventDefault();
            void create();
          }}
        >
          <Input
            label="Name"
            value={values.name}
            maxLength={50}
            onChange={event => set("name", event.target.value)}
            onBlur={() => check("name")}
            error={errors.name}
          />
          <Input
            label="Title"
            value={values.title}
            maxLength={100}
            onChange={event => set("title", event.target.value)}
            onBlur={() => check("title")}
            error={errors.title}
          />
          <Input
            label="Identifier"
            value={values.category}
            maxLength={50}
            onChange={event => {
              setIdentifierEdited(true);
              set("category", event.target.value.toLowerCase());
            }}
            onBlur={() => check("category")}
            error={errors.category}
            helper="Suggested from the name. Lowercase letters, numbers and hyphens."
            className="font-prism-mono text-prism-code"
          />
          <Textarea
            label="Description"
            value={values.description}
            rows={3}
            maxLength={240}
            onChange={event => set("description", event.target.value)}
            onBlur={() => check("description")}
            error={errors.description}
            helper={`${values.description.length} of 240 characters`}
          />
          <div className="space-y-2">
            <p className="text-prism-label font-semibold text-prism-ink">Image</p>
            <div className="prism-well flex items-center gap-3 px-3 py-2">
              <ImageIcon aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
              <span className="min-w-0 flex-1 truncate text-prism-label text-prism-ink">
                {image?.name ?? "No image yet"}
              </span>
              <Button type="button" variant="secondary" onClick={() => imageRef.current?.click()}>
                {image ? "Change" : "Select file"}
              </Button>
            </div>
            <input
              ref={imageRef}
              type="file"
              className="hidden"
              accept={ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES.join(",")}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const problem = validateImageFile(file, limits);
                setErrors(e => ({ ...e, image: problem }));
                if (!problem) setImage(file);
              }}
            />
            {errors.image ? (
              <FieldError>{errors.image}</FieldError>
            ) : (
              <p className="text-prism-meta text-prism-ink-2">{imageLimitsLine(limits)}</p>
            )}
          </div>
          {errors.form && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              {errors.form}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
              Create collection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
