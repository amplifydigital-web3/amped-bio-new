import { useEffect, useState } from "react";
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
  trpcClient,
} from "@repo/ui";

// Screen Review 088 I06. Edit collection on the shared Dialog: Title and
// Description, Save changes enabled only when a value differs.

export interface EditableCollection {
  id: number;
  title: string;
  description?: string | null;
}

export function EditCollectionDialog({
  collection,
  onClose,
  onSuccess,
}: {
  collection: EditableCollection | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<{ title?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!collection) return;
    setTitle(collection.title);
    setDescription(collection.description ?? "");
    setError({});
  }, [collection]);

  if (!collection) return null;
  const dirty =
    title.trim() !== collection.title || description.trim() !== (collection.description ?? "");

  const save = async () => {
    if (!title.trim()) {
      setError({ title: "Add a title." });
      return;
    }
    setSaving(true);
    try {
      await trpcClient.admin.themes.updateThemeCategory.mutate({
        id: collection.id,
        title: title.trim(),
        description: description.trim(),
      });
      toast.success("Collection updated");
      onSuccess();
      onClose();
    } catch {
      setError({ form: "The changes did not save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {collection.title}</DialogTitle>
        </DialogHeader>
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
            value={title}
            maxLength={100}
            onChange={event => setTitle(event.target.value)}
            onBlur={() =>
              setError(e => ({ ...e, title: title.trim() ? undefined : "Add a title." }))
            }
            error={error.title}
          />
          <Textarea
            label="Description"
            value={description}
            rows={3}
            maxLength={240}
            onChange={event => setDescription(event.target.value)}
          />
          {error.form && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              {error.form}
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
