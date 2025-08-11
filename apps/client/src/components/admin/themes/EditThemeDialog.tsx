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
import { Input } from "../../ui/Input";
import { Label } from "../../ui/label";
import { Button } from "../../ui/Button";
import { trpc } from "../../../utils/trpc";
import { updateThemeSchema } from "../../../schemas"; // Assuming this path

interface EditThemeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: { id: number; name: string };
  onSuccess: () => void;
}

type FormData = z.infer<typeof updateThemeSchema>;

export function EditThemeDialog({
  isOpen,
  onClose,
  theme,
  onSuccess,
}: EditThemeDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(updateThemeSchema),
    defaultValues: {
      id: theme.id,
      name: theme.name,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ id: theme.id, name: theme.name });
    }
  }, [isOpen, theme, reset]);

  const updateThemeMutation = trpc.admin.themes.updateTheme.useMutation({
    onSuccess: () => {
      toast.success("Theme updated successfully!");
      onSuccess();
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to update theme: ${error.message}`);
    },
  });

  const onSubmit = (data: FormData) => {
    updateThemeMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Theme</DialogTitle>
          <DialogDescription>
            Make changes to the theme here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Title
            </Label>
            <Input
              id="name"
              {...register("name")}
              className="col-span-3"
              disabled={updateThemeMutation.isPending}
            />
            {errors.name && (
              <p className="col-span-4 text-right text-red-500 text-sm">
                {errors.name.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateThemeMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateThemeMutation.isPending}>
              {updateThemeMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
