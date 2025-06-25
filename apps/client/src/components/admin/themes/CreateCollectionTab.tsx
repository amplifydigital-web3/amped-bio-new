import { useState, useCallback } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc, trpcClient } from "../../../utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { CategoryImageSelector } from "./CategoryImageSelector";

const collectionSchema = z.object({
  name: z.string().min(1, "Collection name is required").max(50, "Collection name must be less than 50 characters"),
  title: z.string().min(1, "Collection title is required").max(100, "Collection title must be less than 100 characters"),
  category: z.string()
    .min(1, "Collection identifier is required")
    .max(50, "Collection identifier must be less than 50 characters")
    .regex(/^[a-z0-9_-]+$/, "Collection identifier can only contain lowercase letters, numbers, underscores and hyphens"),
  description: z.string().max(240, "Description must not exceed 240 characters").optional(),
});

type CollectionForm = z.infer<typeof collectionSchema>;

interface CreateCollectionTabProps {
  refetchCategories: () => void;
}

export function CreateCollectionTab({ refetchCategories }: CreateCollectionTabProps) {
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  // React Hook Form for collection creation
  const collectionForm = useForm<CollectionForm>({
    resolver: zodResolver(collectionSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      title: "",
      category: "",
      description: "",
    },
  });

  // Clear error messages when user starts typing
  const clearErrorMessages = useCallback(() => {
    // Toast notifications are handled automatically
  }, []);

  // Create handlers that combine form registration with error clearing
  const createInputHandler = useCallback((registerFn: any) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      registerFn.onChange(e);
      clearErrorMessages();
    };
  }, [clearErrorMessages]);

  const collectionMutation = useMutation(trpc.admin.themes.createThemeCategory.mutationOptions());

  const handleCollectionSubmit = async (data: CollectionForm) => {
    try {
      // Step 1: Create the collection
      const newCollection = await collectionMutation.mutateAsync(data);
      
      // Step 2: If there's an image file, upload it
      if (selectedImageFile) {
        try {
          await uploadCollectionImage(newCollection.id, selectedImageFile);
          toast.success("Collection created successfully with image!");
        } catch (imageError: any) {
          toast.error(`Collection created but image upload failed: ${imageError.message}`);
        }
      } else {
        toast.success("Collection created successfully!");
      }
      
      // Only reset form and image on success
      collectionForm.reset();
      setSelectedImageFile(null);
      refetchCategories();
      
    } catch (err: any) {
      toast.error(err?.message || "Failed to create collection");
      // Do not reset form or image on error - keep user input
    }
  };

  const uploadCollectionImage = async (categoryId: number, file: File) => {
    const fileType = file.type;
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    
    // Request presigned URL
    const presignedData = await trpcClient.admin.upload.requestThemeCategoryImagePresignedUrl.mutate({
      categoryId,
      contentType: fileType,
      fileExtension: fileExtension,
      fileSize: file.size,
    });
    
    // Upload to S3
    const uploadResponse = await fetch(presignedData.presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': fileType
      }
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }
    
    // Confirm upload
    await trpcClient.admin.upload.confirmThemeCategoryImageUpload.mutate({
      categoryId,
      fileId: presignedData.fileId,
      fileName: file.name,
    });
  };

  const handleImageFileSelect = useCallback((file: File | null) => {
    setSelectedImageFile(file);
    // Clear general error messages when user selects/changes image
    clearErrorMessages();
  }, [clearErrorMessages]);

  const handleImageError = (error: string) => {
    toast.error(error);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-2xl font-bold">Create Collection</h2>
        <p className="text-gray-600 mt-1">Create a new theme collection</p>
      </div>
      
      <div className="p-6">
        <form onSubmit={collectionForm.handleSubmit(handleCollectionSubmit)} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="collection-name">
                Collection Name
              </label>
              <input
                id="collection-name"
                type="text"
                className={`w-full px-3 py-2 border rounded-md ${
                  collectionForm.formState.errors.name ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="e.g., Business"
                {...collectionForm.register("name")}
                onChange={createInputHandler(collectionForm.register("name"))}
              />
              {collectionForm.formState.errors.name && (
                <p className="mt-1 text-sm text-red-600">{collectionForm.formState.errors.name.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="collection-title">
                Collection Title
              </label>
              <input
                id="collection-title"
                type="text"
                className={`w-full px-3 py-2 border rounded-md ${
                  collectionForm.formState.errors.title ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="e.g., Business Themes"
                {...collectionForm.register("title")}
                onChange={createInputHandler(collectionForm.register("title"))}
              />
              {collectionForm.formState.errors.title && (
                <p className="mt-1 text-sm text-red-600">{collectionForm.formState.errors.title.message}</p>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="collection-identifier">
              Collection Identifier
            </label>
            <input
              id="collection-identifier"
              type="text"
              className={`w-full px-3 py-2 border rounded-md lowercase ${
                collectionForm.formState.errors.category ? "border-red-500" : "border-gray-300"
              }`}
              style={{ textTransform: 'lowercase' }}
              placeholder="e.g., business (lowercase, no spaces)"
              {...collectionForm.register("category")}
              onChange={createInputHandler(collectionForm.register("category"))}
            />
            {collectionForm.formState.errors.category && (
              <p className="mt-1 text-sm text-red-600">{collectionForm.formState.errors.category.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="collection-description">
              Description <span className="text-gray-500">(optional, max 240 characters)</span>
            </label>
            <textarea
              id="collection-description"
              className={`w-full px-3 py-2 border rounded-md ${
                collectionForm.formState.errors.description ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="e.g., Themes designed for business and professional use"
              rows={3}
              maxLength={240}
              {...collectionForm.register("description")}
              onChange={createInputHandler(collectionForm.register("description"))}
            />
            <div className="text-xs text-gray-500 mt-1">
              {collectionForm.watch("description")?.length || 0}/240 characters
            </div>
            {collectionForm.formState.errors.description && (
              <p className="mt-1 text-sm text-red-600">{collectionForm.formState.errors.description.message}</p>
            )}
          </div>
          
          {/* Image Selector */}
          <CategoryImageSelector
            selectedFile={selectedImageFile}
            onFileSelect={handleImageFileSelect}
            onError={handleImageError}
          />
          
          <button
            type="submit"
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            disabled={collectionMutation.status === 'pending'}
          >
            {collectionMutation.status === 'pending' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {collectionMutation.status === 'pending' ? (
              selectedImageFile ? "Creating collection and uploading image..." : "Creating collection..."
            ) : (
              selectedImageFile ? "Create Collection with Image" : "Create Collection"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
