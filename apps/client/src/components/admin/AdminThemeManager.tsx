import { useState } from "react";
import { z } from "zod";
import { trpc } from "../../utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, List } from "lucide-react";

const themeSchema = z.object({
  name: z.string().min(1, "Theme name is required"),
  description: z.string().optional(),
  share_config: z.any().optional(),
  config: z.any().optional(),
  category_id: z.number().nullable().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  title: z.string().min(1, "Category title is required"),
  category: z.string().min(1, "Category identifier is required"),
});

type ThemeForm = z.infer<typeof themeSchema>;
type CategoryForm = z.infer<typeof categorySchema>;

export function AdminThemeManager() {
  const [activeTab, setActiveTab] = useState<"themes" | "categories">("themes");
  
  const [themeForm, setThemeForm] = useState<ThemeForm>({
    name: "",
    description: "",
    share_config: {},
    config: {},
    category_id: null,
  });
  
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: "",
    title: "",
    category: "",
  });
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Queries and mutations
  const { data: categories, refetch: refetchCategories } = useQuery(
    trpc.admin.getThemeCategories.queryOptions()
  );
  
  const themeMutation = useMutation(trpc.admin.createTheme.mutationOptions());
  const categoryMutation = useMutation(trpc.admin.createThemeCategory.mutationOptions());

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.name === "category_id" ? 
      (e.target.value === "" ? null : Number(e.target.value)) : 
      e.target.value;
    setThemeForm({ ...themeForm, [e.target.name]: value });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCategoryForm({ ...categoryForm, [e.target.name]: e.target.value });
  };

  const handleThemeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const parsed = themeSchema.safeParse(themeForm);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    
    try {
      await themeMutation.mutateAsync(parsed.data);
      setSuccess("Theme created successfully");
      setThemeForm({ 
        name: "", 
        description: "", 
        share_config: {}, 
        config: {}, 
        category_id: null 
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create theme");
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const parsed = categorySchema.safeParse(categoryForm);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    
    try {
      await categoryMutation.mutateAsync(parsed.data);
      setSuccess("Category created successfully");
      setCategoryForm({ name: "", title: "", category: "" });
      refetchCategories();
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg border border-gray-200 shadow">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
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
            Manage Categories
          </button>
        </nav>
      </div>

      <div className="p-6">
        {/* Theme Creation Tab */}
        {activeTab === "themes" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Create New Theme</h2>
            <form onSubmit={handleThemeSubmit} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="theme-name">
                  Theme Name
                </label>
                <input
                  id="theme-name"
                  name="name"
                  value={themeForm.name}
                  onChange={handleThemeChange}
                  className="w-full px-3 py-2 border rounded-md border-gray-300"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="theme-description">
                  Description
                </label>
                <textarea
                  id="theme-description"
                  name="description"
                  value={themeForm.description}
                  onChange={handleThemeChange}
                  className="w-full px-3 py-2 border rounded-md border-gray-300"
                  rows={2}
                  placeholder="Theme description (optional)"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="theme-category">
                  Category
                </label>
                <select
                  id="theme-category"
                  name="category_id"
                  value={themeForm.category_id || ""}
                  onChange={handleThemeChange}
                  className="w-full px-3 py-2 border rounded-md border-gray-300"
                >
                  <option value="">No Category</option>
                  {categories?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                disabled={themeMutation.status === 'pending'}
              >
                {themeMutation.status === 'pending' ? "Creating..." : "Create Theme"}
              </button>
            </form>
          </div>
        )}

        {/* Category Management Tab */}
        {activeTab === "categories" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Manage Categories</h2>
            
            {/* Category Creation Form */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Create New Category</h3>
              <form onSubmit={handleCategorySubmit} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="category-name">
                    Category Name
                  </label>
                  <input
                    id="category-name"
                    name="name"
                    value={categoryForm.name}
                    onChange={handleCategoryChange}
                    className="w-full px-3 py-2 border rounded-md border-gray-300"
                    placeholder="e.g., Business"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="category-title">
                    Category Title
                  </label>
                  <input
                    id="category-title"
                    name="title"
                    value={categoryForm.title}
                    onChange={handleCategoryChange}
                    className="w-full px-3 py-2 border rounded-md border-gray-300"
                    placeholder="e.g., Business Themes"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="category-identifier">
                    Category Identifier
                  </label>
                  <input
                    id="category-identifier"
                    name="category"
                    value={categoryForm.category}
                    onChange={handleCategoryChange}
                    className="w-full px-3 py-2 border rounded-md border-gray-300"
                    placeholder="e.g., business (lowercase, no spaces)"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                  disabled={categoryMutation.status === 'pending'}
                >
                  {categoryMutation.status === 'pending' ? "Creating..." : "Create Category"}
                </button>
              </form>
            </div>

            {/* Categories List */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Existing Categories</h3>
              {categories && categories.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <h4 className="font-semibold text-gray-900">{category.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">Name: {category.name}</p>
                      <p className="text-sm text-gray-600">ID: {category.category}</p>
                      <p className="text-sm text-gray-500 mt-2">
                        {category._count?.themes || 0} themes
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No categories created yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Error and Success Messages */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-600 text-sm">{success}</p>
          </div>
        )}
      </div>
    </div>
  );
}
