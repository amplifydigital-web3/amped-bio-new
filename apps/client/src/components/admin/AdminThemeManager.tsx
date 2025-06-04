import { useState } from "react";
import { z } from "zod";
import { trpc } from "../../utils/trpc";
import { useMutation } from "@tanstack/react-query";

const themeSchema = z.object({
  name: z.string().min(1, "Theme name is required"), // required for admin
  description: z.string().optional(), // optional description
  share_level: z.string().optional(),
  share_config: z.any().optional(),
  config: z.any().optional(),
  category: z.string().nullable().optional(),
});

type ThemeForm = z.infer<typeof themeSchema>;

export function AdminThemeManager() {
  const [form, setForm] = useState<ThemeForm>({
    name: "",
    description: "",
    share_level: "private",
    share_config: {},
    config: {},
    category: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation(trpc.admin.createTheme.mutationOptions());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    // Always send category as string or null
    const parsed = themeSchema.safeParse({
      ...form,
      category: form.category === undefined ? null : form.category,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    // Ensure category is string or null
    const input = { ...parsed.data, category: parsed.data.category === undefined ? null : parsed.data.category };
    try {
      await mutation.mutateAsync(input);
      setSuccess("Theme created successfully");
      setForm({ name: "", description: "", share_level: "private", share_config: {}, config: {}, category: null });
    } catch (err: any) {
      setError(err?.message || "Failed to create theme");
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-lg border border-gray-200 shadow">
      <h2 className="text-2xl font-bold mb-4">Create New Theme</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">Theme Name</label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md border-gray-300"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md border-gray-300"
            rows={2}
            placeholder="Theme description (optional)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="share_level">Share Level</label>
          <select
            id="share_level"
            name="share_level"
            value={form.share_level}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md border-gray-300"
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="category">Category</label>
          <input
            id="category"
            name="category"
            value={form.category || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md border-gray-300"
          />
        </div>
        {/* You can add more fields for config/share_config as needed */}
        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          disabled={mutation.status === 'pending'}
        >
          {mutation.status === 'pending' ? "Creating..." : "Create Theme"}
        </button>
      </form>
      {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      {success && <div className="text-green-600 text-sm mt-2">{success}</div>}
    </div>
  );
}
