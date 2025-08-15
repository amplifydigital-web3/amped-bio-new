import { TextBlock } from "@ampedbio/constants";
import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import { Button } from "../../ui/Button";
import { X } from "lucide-react";
import { z } from "zod";
import { Resolver, SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo } from "react";

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
    formState: { errors, isSubmitting },
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
    <div className="fixed top-0 left-0 w-screen h-screen overflow-y-auto bg-black/50 flex items-center justify-center z-50 outline-none">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Text Block</h3>
          <button onClick={onCancel} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

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
