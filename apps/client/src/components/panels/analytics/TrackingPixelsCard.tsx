import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc, trpcClient } from "@repo/ui";
import {
  GA4_MEASUREMENT_ID_PATTERN,
  META_PIXEL_ID_PATTERN,
  TIKTOK_PIXEL_ID_PATTERN,
  type TrackingPixelsUpdate,
} from "@repo/constants";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { AnalyticsCard } from "./AnalyticsCard";
import { HowTo } from "./HowTo";

type IdField = "ga4MeasurementId" | "metaPixelId" | "tiktokPixelId";
type TokenField = "metaCapiToken" | "tiktokEventsToken";

const ID_FIELDS: Array<{
  key: IdField;
  label: string;
  placeholder: string;
  pattern: RegExp;
  help: string;
  guide: string[];
}> = [
  {
    key: "ga4MeasurementId",
    label: "Google Analytics 4 Measurement ID",
    placeholder: "G-XXXXXXXXXX",
    pattern: GA4_MEASUREMENT_ID_PATTERN,
    help: "Google Analytics > Admin > Data streams > your web stream.",
    guide: [
      "Open analytics.google.com and select your property.",
      "Go to Admin, then Data collection and modification, then Data streams.",
      "Open your Web stream. Create one for your amped.bio page URL if you have none.",
      "Copy the Measurement ID. It starts with G-.",
    ],
  },
  {
    key: "metaPixelId",
    label: "Meta Pixel ID",
    placeholder: "123456789012345",
    pattern: META_PIXEL_ID_PATTERN,
    help: "Meta Events Manager > Data sources > your pixel.",
    guide: [
      "Open business.facebook.com/events_manager.",
      "Select Data sources and choose your pixel (dataset). Create one if you have none.",
      "Copy the ID shown under the pixel name. It is 15 to 16 digits.",
      "Optional: in Settings, under Conversions API, choose Generate access token and paste it below.",
    ],
  },
  {
    key: "tiktokPixelId",
    label: "TikTok Pixel ID",
    placeholder: "C1A2B3C4D5E6F7G8H9I0",
    pattern: TIKTOK_PIXEL_ID_PATTERN,
    help: "TikTok Ads Manager > Tools > Events > Web events.",
    guide: [
      "Open ads.tiktok.com and go to Tools, then Events.",
      "Choose Web events and select your pixel. Create one with manual setup if you have none.",
      "Copy the Pixel ID shown under the pixel name. It is about 20 letters and numbers.",
      "Optional: in Settings, under Events API, choose Generate access token and paste it below.",
    ],
  },
];

const TOKEN_FIELDS: Array<{ key: TokenField; label: string; requires: IdField; help: string }> = [
  {
    key: "metaCapiToken",
    label: "Meta Conversions API access token (optional)",
    requires: "metaPixelId",
    help: "Events Manager > your pixel > Settings > Generate access token. Adds server-side events.",
  },
  {
    key: "tiktokEventsToken",
    label: "TikTok Events API access token (optional)",
    requires: "tiktokPixelId",
    help: "Events > your pixel > Settings > Generate access token. Adds server-side events.",
  },
];

export function TrackingPixelsCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.trackingPixels.get.queryOptions());

  const [ids, setIds] = useState<Record<IdField, string>>({
    ga4MeasurementId: "",
    metaPixelId: "",
    tiktokPixelId: "",
  });
  const [tokens, setTokens] = useState<Record<TokenField, string>>({
    metaCapiToken: "",
    tiktokEventsToken: "",
  });
  const [removeTokens, setRemoveTokens] = useState<Record<TokenField, boolean>>({
    metaCapiToken: false,
    tiktokEventsToken: false,
  });

  useEffect(() => {
    if (!data) return;
    setIds({
      ga4MeasurementId: data.ga4MeasurementId ?? "",
      metaPixelId: data.metaPixelId ?? "",
      tiktokPixelId: data.tiktokPixelId ?? "",
    });
  }, [data]);

  const hasToken: Record<TokenField, boolean> = {
    metaCapiToken: !!data?.hasMetaCapiToken,
    tiktokEventsToken: !!data?.hasTiktokEventsToken,
  };

  const invalid = ID_FIELDS.filter(
    field => ids[field.key] && !field.pattern.test(ids[field.key].trim().toUpperCase())
  );

  const save = useMutation({
    mutationFn: () => {
      const input: TrackingPixelsUpdate = {
        ga4MeasurementId: ids.ga4MeasurementId.trim(),
        metaPixelId: ids.metaPixelId.trim(),
        tiktokPixelId: ids.tiktokPixelId.trim(),
      };
      for (const field of TOKEN_FIELDS) {
        if (removeTokens[field.key] || !ids[field.requires].trim()) input[field.key] = "";
        else if (tokens[field.key].trim()) input[field.key] = tokens[field.key].trim();
      }
      return trpcClient.trackingPixels.update.mutate(input);
    },
    onSuccess: async () => {
      setTokens({ metaCapiToken: "", tiktokEventsToken: "" });
      setRemoveTokens({ metaCapiToken: false, tiktokEventsToken: false });
      await queryClient.invalidateQueries({ queryKey: trpc.trackingPixels.get.queryKey() });
      toast.success("Tracking settings saved");
    },
    onError: () => toast.error("Could not save tracking settings"),
  });

  const anyPixel = ID_FIELDS.some(field => ids[field.key].trim());

  return (
    <AnalyticsCard
      id="pixels"
      title="Ad and analytics pixels"
      description="Send your page views and link clicks to Google Analytics, Meta and TikTok."
      info="Your pixels receive page views and link clicks from visitors who allow ads and analytics on your page. Tokens are encrypted and never shown again after saving."
    >
      <div className="mb-4">
        <HowTo
          storageKey="pixels"
          title="How to connect your pixels"
          steps={[
            "You only need this if you run ads or use Google Analytics. Your Amped analytics work without it.",
            "Open the guide under each field below to find your ID in Google, Meta or TikTok.",
            "Paste the IDs you have and choose Save. Leave the others empty.",
            "For more reliable ad results, add the optional Meta and TikTok tokens. They send events from our server too.",
            "Open your page in a private window, choose Accept all, and check that the visit shows up in each platform within a few minutes.",
          ]}
        />
      </div>
      {isLoading ? (
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
      ) : (
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            if (invalid.length === 0) save.mutate();
          }}
        >
          <div className="grid md:grid-cols-3 gap-3">
            {ID_FIELDS.map(field => {
              const isInvalid = invalid.includes(field);
              return (
                <div key={field.key}>
                  <label className="text-xs font-medium text-gray-600">
                    {field.label}
                    <input
                      value={ids[field.key]}
                      onChange={event =>
                        setIds(prev => ({ ...prev, [field.key]: event.target.value }))
                      }
                      placeholder={field.placeholder}
                      maxLength={32}
                      aria-invalid={isInvalid}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 font-mono ${
                        isInvalid ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                    <span
                      className={`block mt-1 font-normal ${isInvalid ? "text-red-700" : "text-gray-500"}`}
                    >
                      {isInvalid ? `Check the format, e.g. ${field.placeholder}` : field.help}
                    </span>
                  </label>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-blue-800 underline">
                      Where do I find this?
                    </summary>
                    <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-gray-600">
                      {field.guide.map(step => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                </div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {TOKEN_FIELDS.map(field => {
              const enabled = !!ids[field.requires].trim();
              const stored = hasToken[field.key] && !removeTokens[field.key];
              return (
                <label
                  key={field.key}
                  className={`text-xs font-medium ${enabled ? "text-gray-600" : "text-gray-400"}`}
                >
                  {field.label}
                  <div className="mt-1 flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      disabled={!enabled}
                      value={tokens[field.key]}
                      onChange={event =>
                        setTokens(prev => ({ ...prev, [field.key]: event.target.value }))
                      }
                      placeholder={
                        stored ? "Saved. Enter a new token to replace it." : "Paste token"
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                    />
                    {stored && (
                      <button
                        type="button"
                        onClick={() => setRemoveTokens(prev => ({ ...prev, [field.key]: true }))}
                        className="shrink-0 rounded-lg border border-gray-300 px-3 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <span className="block mt-1 font-normal text-gray-500">
                    {stored ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> Server-side events active.
                      </span>
                    ) : (
                      field.help
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {anyPixel && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
              <p>
                Visitors will see a consent banner. Pixels load only for visitors who accept, and
                never for browsers that send a Global Privacy Control signal. You are responsible
                for how you use data these platforms collect about your visitors.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={save.isPending || invalid.length > 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      )}
    </AnalyticsCard>
  );
}
