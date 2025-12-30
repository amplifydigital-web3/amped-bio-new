import { TextBlock } from "@ampedbio/constants";
import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import { Button } from "../../ui/Button";
import { z } from "zod";
import { Resolver, SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";

// Create Zod schema for text block validation
export const textBlockSchema = z.object({
  content: z.string().min(1, "Content is required").trim(),
  platform: z.string().default(""),
});

export type TextBlockFormData = z.infer<typeof textBlockSchema>;

interface TextBlockEditorProps {
  block: TextBlock;
  onSave: (blockConfig: TextBlock["config"]) => void;
  onCancel: () => void;
}

export function TextBlockEditor({ block, onSave, onCancel }: TextBlockEditorProps) {
  // Set up initial values for the text block
  const initialValues = useMemo(() => {
    return {
      content: block.config.content || "",
      platform: block.config.platform || "",
    };
  }, [block.config]);

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TextBlockFormData>({
    resolver: zodResolver(textBlockSchema) as Resolver<TextBlockFormData>,
    defaultValues: initialValues,
    mode: "onChange",
  });

  const onSubmit: SubmitHandler<TextBlockFormData> = useCallback(
    (data: TextBlockFormData) => {
      console.log("Saving text block:", data);
      onSave(data);
    },
    [onSave]
  );

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Text Block</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <SlateEditor
            initialValue={block.config.content}
            onSave={e => {
              console.log("SlateEditor onSave with content:", e);
              setValue("content", e, { shouldValidate: true, shouldDirty: true });
            }}
          />
          <input type="hidden" {...register("content")} />
          <input type="hidden" {...register("platform")} value={watch("platform")} />

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
