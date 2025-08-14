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
import { updateThemeSchema } from "../../../schemas";
import { TRPCClientError } from "@trpc/client";

interface Theme {
  id: number;
  name: string;
  description?: string | null;
}

type FormData = z.infer<typeof updateThemeSchema>;

/**
 * Hook to control the EditThemeDialog state and functionality
 */
export function useEditThemeDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);

  const open = (themeData: Theme) => {
    setTheme(themeData);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setTheme(null);
  };

  return {
    isOpen,
    theme,
    open,
    close,
  };
}

interface EditThemeDialogProps {
  theme: Theme;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * The EditThemeDialog component that follows the same style as EditCollectionDialog
 */
export function EditThemeDialog({ isOpen, onClose, theme, onSuccess }: EditThemeDialogProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(updateThemeSchema),
    defaultValues: {
      id: theme?.id,
      name: theme?.name || "",
      description: theme?.description || "",
    },
  });

  useEffect(() => {
    if (isOpen && theme) {
      form.reset({
        id: theme.id,
        name: theme.name,
        description: theme.description || "",
      });
    }
  }, [isOpen, theme, form]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await trpcClient.admin.themes.updateTheme.mutate(data);
      toast.success("Theme updated successfully!");
      onSuccess();
      onClose();
    } catch (error) {
      if (error instanceof TRPCClientError) {
        toast.error(`Failed to update theme: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={loading} placeholder="Enter theme title" />
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
                      placeholder="Enter theme description"
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
