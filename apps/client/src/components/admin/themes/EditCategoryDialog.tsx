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
} from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Label } from "../../ui/Label";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Textarea"; // Assuming Textarea is available
import { trpc } from "../../../utils/trpc";
import { updateCategorySchema } from "../../../schemas"; // Assuming this path

interface EditCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  category: { id: number; title: string; description?: string | null };
  onSuccess: () => void;
}

type FormData = z.infer<typeof updateCategorySchema>;

export function EditCategoryDialog({
  isOpen,
  onClose,
  category,
  onSuccess,
}: EditCategoryDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(updateCategorySchema),
    defaultValues: {
      id: category.id,
      title: category.title,
      description: category.description || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ id: category.id, title: category.title, description: category.description || "" });
    }
  }, [isOpen, category, reset]);

  const updateCategoryMutation = trpc.admin.themes.updateThemeCategory.useMutation({
    onSuccess: () => {
      toast.success("Category updated successfully!");
      onSuccess();
      onClose();
    },
    onError: error => {
      toast.error(`Failed to update category: ${error.message}`);
    },
  });

  const onSubmit = (data: FormData) => {
    updateCategoryMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>
            Make changes to the category here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              {...register("title")}
              className="col-span-3"
              disabled={updateCategoryMutation.isPending}
            />
            {errors.title && (
              <p className="col-span-4 text-right text-red-500 text-sm">{errors.title.message}</p>
            )}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Textarea
              id="description"
              {...register("description")}
              className="col-span-3"
              disabled={updateCategoryMutation.isPending}
            />
            {errors.description && (
              <p className="col-span-4 text-right text-red-500 text-sm">
                {errors.description.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateCategoryMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateCategoryMutation.isPending}>
              {updateCategoryMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
