import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import { trpcClient } from "../../../utils/trpc/trpc";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Switch } from "../../../components/ui/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { useState, useEffect } from "react";
import { BannerData } from "@ampedbio/constants";

export function AdminBannerSettings() {
  const queryClient = useQueryClient();

  // Get the existing banner data
  const { data: bannerData, isLoading } = useQuery(trpc.admin.dashboard.getBanner.queryOptions());

  const [text, setText] = useState("");
  const [type, setType] = useState<BannerData["type"]>("info");
  const [enabled, setEnabled] = useState(false);
  const [panel, setPanel] = useState<BannerData["panel"] | "">("");

  useEffect(() => {
    if (bannerData) {
      setText(bannerData.text || "");
      // Validate the banner type against allowed values and default to "info" if null/empty
      const validTypes = ["info", "warning", "success", "error"];
      const bannerType =
        bannerData.type && validTypes.includes(bannerData.type)
          ? (bannerData.type as BannerData["type"])
          : "info";
      setType(bannerType);
      setEnabled(bannerData.enabled || false);
      setPanel(bannerData.panel || "");
    }
  }, [bannerData]);

  const updateBanner = useMutation({
    mutationFn: async (data: BannerData) => {
      return trpcClient.admin.dashboard.updateBanner.mutate({ bannerObject: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.admin.dashboard.getBanner.queryOptions().queryKey,
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If banner is enabled, validate that text is not empty
    if (enabled) {
      if (!text.trim()) {
        console.error("Visible text is required when banner is enabled");
        return;
      }
    }

    // Ensure type is valid before submitting
    const validTypes = ["info", "warning", "success", "error"];
    const validType = validTypes.includes(type) ? (type as BannerData["type"]) : "info";
    updateBanner.mutate({ text, type: validType, enabled, panel: panel || undefined });
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    // Ensure type is valid before submitting
    const validTypes = ["info", "warning", "success", "error"];
    const validType = validTypes.includes(type) ? (type as BannerData["type"]) : "info";
    updateBanner.mutate({ text, type: validType, enabled: checked, panel: panel || undefined });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Banner</CardTitle>
        <CardDescription>
          Set the banner link (URL or path) and visible text for the admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Show Banner</span>
              <p className="text-xs text-gray-500">Toggle to show or hide the dashboard banner</p>
            </div>
            <Switch
              checked={!!enabled}
              onChange={handleToggle}
              aria-label="Toggle banner visibility"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visible Text</label>
            <Input value={text} onChange={e => setText(e.target.value)} placeholder="Click here" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banner Type</label>
            <Select onValueChange={value => setType(value as BannerData["type"])} value={type}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select banner type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="success">Success</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Panel (Optional)</label>
            <Select
              onValueChange={value => setPanel(value as BannerData["panel"])}
              value={panel || undefined}
              defaultValue=""
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select panel (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="profile">Profile</SelectItem>
                <SelectItem value="reward">Reward</SelectItem>
                <SelectItem value="gallery">Gallery</SelectItem>
                <SelectItem value="blocks">Blocks</SelectItem>
                <SelectItem value="rewardPools">Reward Pools</SelectItem>
                <SelectItem value="createRewardPool">Create Reward Pool</SelectItem>
                <SelectItem value="leaderboard">Leaderboard</SelectItem>
                <SelectItem value="rns">RNS</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="pay">Pay</SelectItem>
                <SelectItem value="account">Account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={updateBanner.isPending}>
            {updateBanner.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
