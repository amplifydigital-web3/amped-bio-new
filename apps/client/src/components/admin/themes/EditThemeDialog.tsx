import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-hot-toast";
import { useMutation } from "@tanstack/react-query";
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
import { trpcClient } from "../../../utils/trpc";
import { updateThemeSchema } from "../../../schemas"; // Assuming this path

type FormData = z.infer<typeof updateThemeSchema>;

/**
 * Hook to control the EditThemeDialog state and functionality
 */
export function useEditThemeDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<{ id: number; name: string } | null>(null);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | undefined>(undefined);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(updateThemeSchema),
    defaultValues: {
      id: 0,
      name: "",
    },
  });
  
  const updateThemeMutation = useMutation({
    mutationFn: (data: FormData) => trpcClient.admin.themes.updateTheme.mutate(data),
    onSuccess: () => {
      toast.success("Theme updated successfully!");
      if (onSuccessCallback) {
        onSuccessCallback();
      }
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Failed to update theme: ${error.message}`);
    },
  });
  
  // Open dialog and set current theme
  const openDialog = (theme: { id: number; name: string }, successCallback?: () => void) => {
    setCurrentTheme(theme);
    setOnSuccessCallback(successCallback);
    reset({ id: theme.id, name: theme.name });
    setIsOpen(true);
  };
  
  // Close the dialog
  const handleClose = () => {
    setIsOpen(false);
  };
  
  // Submit handler
  const onSubmit = (data: FormData) => {
    updateThemeMutation.mutate(data);
  };
  
  return {
    isOpen,
    currentTheme,
    register,
    errors,
    handleSubmit,
    onSubmit,
    handleClose,
    openDialog,
    isPending: updateThemeMutation.isPending,
  };
}

/**
 * The EditThemeDialog component that uses the useEditThemeDialog hook
 */
export function EditThemeDialog() {
  const {
    isOpen,
    currentTheme,
    register,
    errors,
    handleSubmit,
    onSubmit,
    handleClose,
    isPending,
  } = useEditThemeDialog();

  if (!isOpen || !currentTheme) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
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
              disabled={isPending}
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
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
