import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import { trpcClient } from "../../../utils/trpc/trpc";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const bannerSchema = z.object({
  url: z.string().min(1, { message: "URL or path is required." }),
  text: z.string().min(1, { message: "Visible text is required." }),
});

export function AdminBannerSettings() {
  const queryClient = useQueryClient();

  // Get the existing banner data (which might be a JSON string)
  const { data: bannerData, isLoading } = useQuery(
    trpc.admin.dashboard.getBanner.queryOptions()
  );

  // Parse the banner data, handling both old format (just URL) and new format (JSON with URL and text)
  let initialBannerData = { url: "", text: "" };
  if (bannerData) {
    try {
      // Try to parse as JSON first (new format)
      const parsed = JSON.parse(bannerData);
      if (typeof parsed === 'object' && parsed !== null) {
        initialBannerData = {
          url: parsed.url || "",
          text: parsed.text || "",
        };
      } else {
        // Old format (just URL string)
        initialBannerData = {
          url: bannerData,
          text: "Banner Link", // Default text for old banners
        };
      }
    } catch (e) {
      // Handle old format (just URL string)
      initialBannerData = {
        url: bannerData,
        text: "Banner Link", // Default text
      };
    }
  }

  const updateBanner = useMutation({
    mutationFn: async (data: { url: string; text: string }) => {
      // Send as JSON object
      const bannerObject = JSON.stringify(data);
      return trpcClient.admin.dashboard.updateBanner.mutate({ bannerObject });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.admin.dashboard.getBanner.queryOptions().queryKey,
      });
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(bannerSchema),
    values: initialBannerData,
  });

  const onSubmit = (data: { url: string; text: string }) => {
    updateBanner.mutate(data);
  };

  // Reset form if banner data changes (in case of refresh)
  if (bannerData) {
    try {
      const parsed = JSON.parse(bannerData);
      if (typeof parsed === 'object' && parsed !== null && 
          (initialBannerData.url !== parsed.url || initialBannerData.text !== parsed.text)) {
        reset({
          url: parsed.url || "",
          text: parsed.text || "",
        });
      }
    } catch (e) {
      if (initialBannerData.url !== bannerData) {
        reset({
          url: bannerData,
          text: "Banner Link",
        });
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Banner</CardTitle>
        <CardDescription>Set the banner link (URL or path) and visible text for the admin dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL or Path</label>
            <Input 
              {...register("url")} 
              placeholder="https://example.com or /path/to/page" 
            />
            {errors.url && <p className="text-red-500 text-sm mt-1">{errors.url.message}</p>}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visible Text</label>
            <Input 
              {...register("text")} 
              placeholder="Click here" 
            />
            {errors.text && <p className="text-red-500 text-sm mt-1">{errors.text.message}</p>}
          </div>
          
          <Button type="submit" disabled={updateBanner.isPending}>
            {updateBanner.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
