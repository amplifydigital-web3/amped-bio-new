import { useState, useCallback } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc, trpcClient } from "../../utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { CategoryImageSelector } from "./CategoryImageSelector";

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50, "Category name must be less than 50 characters"),
  title: z.string().min(1, "Category title is required").max(100, "Category title must be less than 100 characters"),
  category: z.string()
    .min(1, "Category identifier is required")
    .max(50, "Category identifier must be less than 50 characters")
    .regex(/^[a-z0-9_-]+$/, "Category identifier can only contain lowercase letters, numbers, underscores and hyphens"),
  description: z.string().max(240, "Description must not exceed 240 characters").optional(),
});

type CategoryForm = z.infer<typeof categorySchema>;

interface CreateCategoryTabProps {
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  refetchCategories: () => void;
}

export function CreateCategoryTab({ onError, onSuccess, refetchCategories }: CreateCategoryTabProps) {
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  // React Hook Form for category creation
  const categoryForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
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
    onError('');
    onSuccess('');
  }, [onError, onSuccess]);

  // Create handlers that combine form registration with error clearing
  const createInputHandler = useCallback((registerFn: any) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      registerFn.onChange(e);
      clearErrorMessages();
    };
  }, [clearErrorMessages]);

  const categoryMutation = useMutation(trpc.admin.createThemeCategory.mutationOptions());

  const handleCategorySubmit = async (data: CategoryForm) => {
    onError('');
    onSuccess('');
    
    try {
      // Step 1: Create the category
      const newCategory = await categoryMutation.mutateAsync(data);
      
      // Step 2: If there's an image file, upload it
      if (selectedImageFile) {
        try {
          await uploadCategoryImage(newCategory.id, selectedImageFile);
          onSuccess("Category created successfully with image!");
        } catch (imageError: any) {
          onError(`Category created but image upload failed: ${imageError.message}`);
        }
      } else {
        onSuccess("Category created successfully!");
      }
      
      // Only reset form and image on success
      categoryForm.reset();
      setSelectedImageFile(null);
      refetchCategories();
      
    } catch (err: any) {
      onError(err?.message || "Failed to create category");
      // Do not reset form or image on error - keep user input
    }
  };

  const uploadCategoryImage = async (categoryId: number, file: File) => {
    const fileType = file.type;
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    
    // Request presigned URL
    const presignedData = await trpcClient.upload.requestThemeCategoryImagePresignedUrl.mutate({
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
    await trpcClient.upload.confirmThemeCategoryImageUpload.mutate({
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
    onError(error);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-2xl font-bold">Create Category</h2>
        <p className="text-gray-600 mt-1">Create a new theme category</p>
      </div>
      
      <div className="p-6">
        <form onSubmit={categoryForm.handleSubmit(handleCategorySubmit)} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="category-name">
                Category Name
              </label>
              <input
                id="category-name"
                type="text"
                className={`w-full px-3 py-2 border rounded-md ${
                  categoryForm.formState.errors.name ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="e.g., Business"
                {...categoryForm.register("name")}
                onChange={createInputHandler(categoryForm.register("name"))}
              />
              {categoryForm.formState.errors.name && (
                <p className="mt-1 text-sm text-red-600">{categoryForm.formState.errors.name.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="category-title">
                Category Title
              </label>
              <input
                id="category-title"
                type="text"
                className={`w-full px-3 py-2 border rounded-md ${
                  categoryForm.formState.errors.title ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="e.g., Business Themes"
                {...categoryForm.register("title")}
                onChange={createInputHandler(categoryForm.register("title"))}
              />
              {categoryForm.formState.errors.title && (
                <p className="mt-1 text-sm text-red-600">{categoryForm.formState.errors.title.message}</p>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="category-identifier">
              Category Identifier
            </label>
            <input
              id="category-identifier"
              type="text"
              className={`w-full px-3 py-2 border rounded-md lowercase ${
                categoryForm.formState.errors.category ? "border-red-500" : "border-gray-300"
              }`}
              style={{ textTransform: 'lowercase' }}
              placeholder="e.g., business (lowercase, no spaces)"
              {...categoryForm.register("category")}
              onChange={createInputHandler(categoryForm.register("category"))}
            />
            {categoryForm.formState.errors.category && (
              <p className="mt-1 text-sm text-red-600">{categoryForm.formState.errors.category.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="category-description">
              Description <span className="text-gray-500">(optional, max 240 characters)</span>
            </label>
            <textarea
              id="category-description"
              className={`w-full px-3 py-2 border rounded-md ${
                categoryForm.formState.errors.description ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="e.g., Themes designed for business and professional use"
              rows={3}
              maxLength={240}
              {...categoryForm.register("description")}
              onChange={createInputHandler(categoryForm.register("description"))}
            />
            <div className="text-xs text-gray-500 mt-1">
              {categoryForm.watch("description")?.length || 0}/240 characters
            </div>
            {categoryForm.formState.errors.description && (
              <p className="mt-1 text-sm text-red-600">{categoryForm.formState.errors.description.message}</p>
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
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={categoryMutation.status === 'pending'}
          >
            {categoryMutation.status === 'pending' ? (
              selectedImageFile ? "Creating category and uploading image..." : "Creating category..."
            ) : (
              selectedImageFile ? "Create Category with Image" : "Create Category"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
