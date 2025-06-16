import { useState, useCallback, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc, trpcClient } from "../../utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, List, Image as ImageIcon, AlertCircle, Eye, Upload, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { CategoryImageUploader } from "./CategoryImageUploader";
import { CategoryImageSelector } from "./CategoryImageSelector";
import { ThemeThumbnailSelector } from "./ThemeThumbnailSelector";
import { importThemeConfigFromJson } from "../../utils/theme";
import { generateVideoThumbnailFromUrl } from "../../utils/videoThumbnail";
import { toast } from "react-hot-toast";

// Utility function to reduce image quality to 75%
const reduceImageQuality = (file: File, quality: number = 0.75): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Set canvas dimensions to match the image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image on canvas
      ctx?.drawImage(img, 0, 0);
      
      // Convert to blob with reduced quality
      canvas.toBlob((blob) => {
        if (blob) {
          // Create a new file with the same name but reduced quality
          const reducedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
          resolve(reducedFile);
        } else {
          reject(new Error('Failed to reduce image quality'));
        }
      }, file.type, quality);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Utility function to create thumbnail from theme background image URL
const createThumbnailFromImageUrl = async (imageUrl: string): Promise<File | null> => {
  try {
    // Fetch the image from the URL
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const blob = await response.blob();
    const file = new File([blob], 'theme-background.jpg', { type: blob.type });
    
    // Reduce quality to 75%
    const thumbnailFile = await reduceImageQuality(file, 0.75);
    return thumbnailFile;
  } catch (error) {
    console.error('Error creating thumbnail from image URL:', error);
    return null;
  }
};

// Utility function to create thumbnail from video URL
const createThumbnailFromVideoUrl = async (videoUrl: string): Promise<File | null> => {
  try {
    const result = await generateVideoThumbnailFromUrl(videoUrl, {
      width: 400,
      height: 300,
      quality: 0.75,
      timeStamp: 1,
      format: 'image/jpeg'
    });
    
    return result?.file || null;
  } catch (error) {
    console.warn('Error creating thumbnail from video URL:', error);
    return null;
  }
};

const themeSchema = z.object({
  name: z.string().min(1, "Theme name is required").max(100, "Theme name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
  share_config: z.any().optional(),
  config: z.any().optional(),
  category_id: z.number().min(1, "Category is required"),
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
  const [selectedThumbnailFile, setSelectedThumbnailFile] = useState<File | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import theme file state
  const [importedThemeConfig, setImportedThemeConfig] = useState<any>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React Hook Form for theme creation
  const themeForm = useForm<ThemeForm>({
    resolver: zodResolver(themeSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: "",
      share_config: {},
      config: {},
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
    const stringValue = e.target.value;
    if (stringValue === "") {
      // Don't set anything when empty - this will trigger validation error
      themeForm.setValue("category_id", undefined as any);
    } else {
      // Convert to number when a valid category is selected
      const numericValue = Number(stringValue);
      themeForm.setValue("category_id", numericValue);
    }
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
      // Step 1: Create the theme
      const newTheme = await themeMutation.mutateAsync(data);
      
      // Step 2: If there's a thumbnail file, upload it
      if (selectedThumbnailFile) {
        try {
          await uploadThemeThumbnail(newTheme.id, selectedThumbnailFile);
          setSuccess("Theme created successfully with thumbnail!");
        } catch (thumbnailError: any) {
          setError(`Theme created but thumbnail upload failed: ${thumbnailError.message}`);
        }
      } else {
        setSuccess("Theme created successfully!");
      }
      
      // Only reset form and files on success
      themeForm.reset();
      setSelectedThumbnailFile(null);
      handleClearImportedConfig();
      
    } catch (err: any) {
      setError(err?.message || "Failed to create theme");
      // Do not reset form or files on error - keep user input
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

  const uploadThemeThumbnail = async (themeId: number, file: File) => {
    const fileType = file.type;
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    
    // Request presigned URL
    const presignedData = await trpcClient.upload.requestThemeThumbnailPresignedUrl.mutate({
      themeId,
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
    await trpcClient.upload.confirmThemeThumbnailUpload.mutate({
      themeId,
      fileId: presignedData.fileId,
      fileName: file.name,
    });
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

  const handleThumbnailFileSelect = useCallback((file: File | null) => {
    setSelectedThumbnailFile(file);
    // Clear general error messages when user selects/changes thumbnail
    clearErrorMessages();
  }, [clearErrorMessages]);

  const handleImageError = (error: string) => {
    setError(error);
  };

  // Handle theme file import
  const handleImportTheme = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    try {
      // Validate and parse the theme configuration
      const themeConfig = await importThemeConfigFromJson(file);
      
      // Extract filename without extension and clean the theme name
      const fileName = file.name
        .replace(/\.ampedtheme$/, '') // Remove extension
        .replace(/[^a-zA-Z]/g, ' ') // Remove all non-letter characters (numbers, underscores, etc.)
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim(); // Remove leading/trailing spaces
      
      // Set the imported theme config for display and use
      setImportedThemeConfig(themeConfig);
      setIsAccordionOpen(true);
      
      // Auto-populate the form with the imported theme config and filename
      themeForm.setValue("config", themeConfig);
      themeForm.setValue("name", fileName);
      
      // Check if the theme has a background and create thumbnail
      if (themeConfig.background?.value) {
        if (themeConfig.background.type === "image") {
          toast.loading('Creating thumbnail from background image...');
          const thumbnailFile = await createThumbnailFromImageUrl(themeConfig.background.value);
          toast.dismiss();
          
          if (thumbnailFile) {
            setSelectedThumbnailFile(thumbnailFile);
            toast.success('Theme imported and thumbnail generated successfully!');
          } else {
            toast.success('Theme imported! Please select a thumbnail manually for better results.');
          }
        } else if (themeConfig.background.type === "video") {
          toast.loading('Creating thumbnail from background video...');
          const thumbnailFile = await createThumbnailFromVideoUrl(themeConfig.background.value);
          toast.dismiss();
          
          if (thumbnailFile) {
            setSelectedThumbnailFile(thumbnailFile);
            toast.success('Theme imported and thumbnail generated successfully!');
          } else {
            toast('Theme imported! Please select a thumbnail manually for better video preview.', {
              icon: '📸',
              duration: 4000
            });
          }
        } else {
          toast.success('Theme imported! Please select a thumbnail manually.');
        }
      } else {
        toast.success('Theme imported! Please select a thumbnail manually.');
      }
      
      // Reset the file input to allow selecting the same file again
      e.target.value = "";
    } catch (err: any) {
      setError(`❌ Failed to import theme: ${err.message || "Invalid .ampedtheme file format"}`);
      // Reset the file input
      e.target.value = "";
    }
  }, [themeForm]);

  const handleImportButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClearImportedConfig = useCallback(() => {
    setImportedThemeConfig(null);
    setIsAccordionOpen(false);
    // Clear the config from the form as well
    themeForm.setValue("config", {});
    // Clear the thumbnail if it was automatically generated from imported theme
    setSelectedThumbnailFile(null);
    setSuccess("Imported configuration and thumbnail cleared");
  }, [themeForm]);

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
          <div className="space-y-6">
            {/* Create Theme Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Create New Theme</h2>
                    <p className="text-gray-600 mt-1">Create a theme manually or import from an .ampedtheme file</p>
                  </div>
                  {importedThemeConfig && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      <FileText className="h-4 w-4" />
                      <span>Using imported config</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6">
                <form onSubmit={themeForm.handleSubmit(handleThemeSubmit)} className="space-y-4 max-w-xl">
                
                {/* Import Theme Field */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Import Theme Configuration
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportTheme}
                      accept=".ampedtheme"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={handleImportButtonClick}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Import .ampedtheme File</span>
                    </button>
                    {importedThemeConfig && (
                      <button
                        type="button"
                        onClick={handleClearImportedConfig}
                        className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        <AlertCircle className="h-4 w-4" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Import a .ampedtheme file to auto-populate the form.
                  </p>
                </div>

                {/* Accordion for imported theme config */}
                {importedThemeConfig && (
                  <div className="border border-gray-200 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">Imported Theme Configuration</span>
                      </div>
                      {isAccordionOpen ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                    </button>
                    
                    {isAccordionOpen && (
                      <div className="border-t border-gray-200">
                        <div className="p-4 bg-gray-50">
                          <div className="flex items-start space-x-4 mb-3">
                            <div className="flex-1">
                              <p className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Configuration Details:</span>
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                                <div>• Button Style: {importedThemeConfig.buttonStyle || 'Not set'}</div>
                                <div>• Container Style: {importedThemeConfig.containerStyle || 'Not set'}</div>
                                <div>• Font Family: {importedThemeConfig.fontFamily || 'Not set'}</div>
                                <div>• Font Size: {importedThemeConfig.fontSize || 'Not set'}</div>
                                <div>• Button Color: {importedThemeConfig.buttonColor || 'Not set'}</div>
                                <div>• Background Type: {importedThemeConfig.background?.type || 'Not set'}</div>
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">JSON Configuration:</p>
                          <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
                            <code className="text-green-400 text-sm whitespace-pre-wrap font-mono">
                              {JSON.stringify(importedThemeConfig, null, 2)}
                            </code>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                    Category *
                  </label>
                  <select
                    id="theme-category"
                    className={`w-full px-3 py-2 border rounded-md ${
                      themeForm.formState.errors.category_id ? "border-red-500" : "border-gray-300"
                    }`}
                    value={themeForm.watch("category_id") ?? ""}
                    onChange={handleCategorySelect}
                  >
                    <option value="">Select a category</option>
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
                
                {/* Thumbnail Selector */}
                <div>
                  <ThemeThumbnailSelector
                    selectedFile={selectedThumbnailFile}
                    onFileSelect={handleThumbnailFileSelect}
                    onError={handleImageError}
                  />
                  {selectedThumbnailFile && importedThemeConfig?.background?.type === "image" && (
                    <div className="mt-2 flex items-center space-x-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-800">
                        Thumbnail generated automatically from theme background image (75% quality)
                      </span>
                    </div>
                  )}
                </div>
                
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={themeMutation.status === 'pending'}
                >
                  {themeMutation.status === 'pending' ? (
                    selectedThumbnailFile ? "Creating theme and uploading thumbnail..." : "Creating theme..."
                  ) : (
                    selectedThumbnailFile ? "Create Theme with Thumbnail" : "Create Theme"
                  )}
                </button>
              </form>
            </div>
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
                          currentImageUrl={undefined}
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
