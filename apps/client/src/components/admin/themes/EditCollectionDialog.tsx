import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../ui/form";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Textarea";
import { trpcClient } from "../../../utils/trpc";
import { updateCategorySchema } from "../../../schemas";
import { TRPCClientError } from "@trpc/client";

interface Category {
  id: number;
  title: string;
  description?: string | null;
}

interface EditCollectionDialogProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type FormData = z.infer<typeof updateCategorySchema>;

export function useEditCollectionDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);

  const open = (cat: Category) => {
    setCategory(cat);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setCategory(null);
  };

  return {
    isOpen,
    category,
    open,
    close,
  };
}

export function EditCollectionDialog({
  isOpen,
  onClose,
  category,
  onSuccess,
}: EditCollectionDialogProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(updateCategorySchema),
    defaultValues: {
      id: category?.id,
      title: category?.title || "",
      description: category?.description || "",
    },
  });

  useEffect(() => {
    if (isOpen && category) {
      form.reset({
        id: category.id,
        title: category.title,
        description: category.description || "",
      });
    }
  }, [isOpen, category, form]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await trpcClient.admin.themes.updateThemeCategory.mutate(data);
      toast.success("Collection updated successfully!");
      onSuccess();
      onClose();
    } catch (error) {
      if (error instanceof TRPCClientError) {
        toast.error(`Failed to update collection: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Collection</DialogTitle>
          <DialogDescription>
            Make changes to the collection here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={loading} placeholder="Enter collection title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={loading}
                      placeholder="Enter collection description"
                      className="min-h-[100px] w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
