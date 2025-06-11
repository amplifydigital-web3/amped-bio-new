import { useState, useCallback } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc, trpcClient } from "../../utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, List, Image as ImageIcon, AlertCircle, Eye } from "lucide-react";
import { CategoryImageUploader } from "./CategoryImageUploader";
import { CategoryImageSelector } from "./CategoryImageSelector";

const themeSchema = z.object({
  name: z.string().min(1, "Theme name is required").max(100, "Theme name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
  share_config: z.any().optional(),
  config: z.any().optional(),
  category_id: z.number().nullable().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50, "Category name must be less than 50 characters"),
  title: z.string().min(1, "Category title is required").max(100, "Category title must be less than 100 characters"),
  category: z.string()
    .min(1, "Category identifier is required")
    .max(50, "Category identifier must be less than 50 characters")
    .regex(/^[a-z0-9_-]+$/, "Category identifier can only contain lowercase letters, numbers, underscores and hyphens"),
  description: z.string().max(240, "Description must not exceed 240 characters").optional(),
});

type ThemeForm = z.infer<typeof themeSchema>;
type CategoryForm = z.infer<typeof categorySchema>;

export function AdminThemeManager() {
  const [activeTab, setActiveTab] = useState<"themes" | "categories" | "view-categories">("themes");
  
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // React Hook Form for theme creation
  const themeForm = useForm<ThemeForm>({
    resolver: zodResolver(themeSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: "",
      share_config: {},
      config: {},
      category_id: null,
    },
  });

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
    setError(null);
    setSuccess(null);
  }, []);

  // Create handlers that combine form registration with error clearing
  const createInputHandler = useCallback((registerFn: any) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      registerFn.onChange(e);
      clearErrorMessages();
    };
  }, [clearErrorMessages]);

  // Special handler for category_id select with value transformation
  const handleCategorySelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === "" ? null : Number(e.target.value);
    themeForm.setValue("category_id", value);
    clearErrorMessages();
  }, [themeForm, clearErrorMessages]);

  // Queries and mutations
  const { data: categories, refetch: refetchCategories } = useQuery(
    trpc.admin.getThemeCategories.queryOptions()
  );
  
  const themeMutation = useMutation(trpc.admin.createTheme.mutationOptions());
  const categoryMutation = useMutation(trpc.admin.createThemeCategory.mutationOptions());

  const handleThemeSubmit = async (data: ThemeForm) => {
    setError(null);
    setSuccess(null);
    
    try {
      await themeMutation.mutateAsync(data);
      setSuccess("Theme created successfully");
      // Only reset form on success
      themeForm.reset();
    } catch (err: any) {
      setError(err?.message || "Failed to create theme");
      // Do not reset form on error - keep user input
    }
  };

  const handleCategorySubmit = async (data: CategoryForm) => {
    setError(null);
    setSuccess(null);
    
    try {
      // Step 1: Create the category
      const newCategory = await categoryMutation.mutateAsync(data);
      
      // Step 2: If there's an image file, upload it
      if (selectedImageFile) {
        try {
          await uploadCategoryImage(newCategory.id, selectedImageFile);
          setSuccess("Category created successfully with image!");
        } catch (imageError: any) {
          setError(`Category created but image upload failed: ${imageError.message}`);
        }
      } else {
        setSuccess("Category created successfully!");
      }
      
      // Only reset form and image on success
      categoryForm.reset();
      setSelectedImageFile(null);
      refetchCategories();
      
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
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
    setError(error);
  };

  return (
    <div className="flex flex-col bg-gray-50">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("themes")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "themes"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Plus className="h-4 w-4 inline mr-2" />
              Create Theme
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "categories"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <List className="h-4 w-4 inline mr-2" />
              Create Category
            </button>
            <button
              onClick={() => setActiveTab("view-categories")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "view-categories"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Eye className="h-4 w-4 inline mr-2" />
              View Categories
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
        {/* Theme Creation Tab */}
        {activeTab === "themes" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Create New Theme</h2>
              <form onSubmit={themeForm.handleSubmit(handleThemeSubmit)} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="theme-name">
                    Theme Name
                  </label>
                  <input
                    id="theme-name"
                    type="text"
                    className={`w-full px-3 py-2 border rounded-md ${
                      themeForm.formState.errors.name ? "border-red-500" : "border-gray-300"
                    }`}
                    {...themeForm.register("name")}
                    onChange={createInputHandler(themeForm.register("name"))}
                  />
                  {themeForm.formState.errors.name && (
                    <p className="mt-1 text-sm text-red-600">{themeForm.formState.errors.name.message}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="theme-description">
                    Description
                  </label>
                  <textarea
                    id="theme-description"
                    className={`w-full px-3 py-2 border rounded-md ${
                      themeForm.formState.errors.description ? "border-red-500" : "border-gray-300"
                    }`}
                    rows={2}
                    placeholder="Theme description (optional)"
                    {...themeForm.register("description")}
                    onChange={createInputHandler(themeForm.register("description"))}
                  />
                  {themeForm.formState.errors.description && (
                    <p className="mt-1 text-sm text-red-600">{themeForm.formState.errors.description.message}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="theme-category">
                    Category
                  </label>
                  <select
                    id="theme-category"
                    className={`w-full px-3 py-2 border rounded-md ${
                      themeForm.formState.errors.category_id ? "border-red-500" : "border-gray-300"
                    }`}
                    value={themeForm.watch("category_id") ?? ""}
                    onChange={handleCategorySelect}
                  >
                    <option value="">No Category</option>
                    {categories?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                  {themeForm.formState.errors.category_id && (
                    <p className="mt-1 text-sm text-red-600">{themeForm.formState.errors.category_id.message}</p>
                  )}
                </div>
                
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={themeMutation.status === 'pending'}
                >
                  {themeMutation.status === 'pending' ? "Creating..." : "Create Theme"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Category Management Tab */}
        {activeTab === "categories" && (
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
                    className={`w-full px-3 py-2 border rounded-md ${
                      categoryForm.formState.errors.category ? "border-red-500" : "border-gray-300"
                    }`}
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
        )}

        {/* View Categories Tab */}
        {activeTab === "view-categories" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">Categories</h2>
              <p className="text-gray-600 mt-1">
                {categories?.length || 0} categories created
              </p>
            </div>
            
            <div className="p-6">
              {categories && categories.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="group p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200 bg-gray-50"
                    >
                      <div className="flex items-start space-x-4">
                        {/* Category Image */}
                        <div className="flex-shrink-0">
                          {category.image ? (
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-gray-200 shadow-sm">
                              <img 
                                src={category.image} 
                                alt={category.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                              <ImageIcon className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Category Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 text-sm truncate">{category.title}</h4>
                          {category.description && (
                            <p className="text-xs text-gray-700 mt-1 italic break-words">"{category.description}"</p>
                          )}
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-gray-600">Name: <span className="font-medium">{category.name}</span></p>
                            <p className="text-xs text-gray-600">ID: <span className="font-mono text-xs">{category.category}</span></p>
                            <p className="text-xs text-gray-500">
                              {category._count?.themes || 0} themes
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Image Upload for Existing Categories */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <CategoryImageUploader
                          categoryId={category.id}
                          currentImageUrl={category.image || undefined}
                          onImageUpload={(_imageUrl, _fileId) => {
                            setSuccess(`Image updated for ${category.title}`);
                            refetchCategories();
                          }}
                          onError={(error) => setError(`Failed to update image for ${category.title}: ${error}`)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <List className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No categories</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by creating your first category.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error and Success Messages */}
        {(error || success) && (
          <div className="space-y-3">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 text-sm font-medium">{success}</p>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
