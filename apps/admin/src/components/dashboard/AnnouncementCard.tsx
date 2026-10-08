import { useEffect, useId, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  ChipGroup,
  ErrorCard,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  trpc,
  trpcClient,
} from "@repo/ui";
import {
  BANNER_LIVE_PANELS,
  BANNER_PANEL_LABELS,
  liveBannerPanel,
  type BannerData,
  type BannerLivePanel,
} from "@repo/constants";
import { Eyebrow, FieldError, retryToast } from "../../kit/parts";

// Screen Review 087 I10. One form: Show on the editor (checkbox, 087 D1),
// Message, Type chips, Link to, a live preview of the row 005 notice, and
// one Publish. Toggling the checkbox no longer publishes by itself.

type BannerType = BannerData["type"];
const TYPES: { value: BannerType; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];
const NONE = "none";
const MESSAGE_ERROR = "Add a message to show the announcement.";

export function AnnouncementCard() {
  const queryClient = useQueryClient();
  const banner = useQuery(trpc.admin.dashboard.getBanner.queryOptions());
  const messageId = useId();

  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<BannerType>("info");
  const [panel, setPanel] = useState<BannerLivePanel | typeof NONE>(NONE);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!banner.data) return;
    setText(banner.data.text || "");
    const stored = banner.data.type as BannerType;
    setType(TYPES.some(t => t.value === stored) ? stored : "info");
    setEnabled(!!banner.data.enabled);
    setPanel(liveBannerPanel(banner.data.panel as BannerData["panel"]) ?? NONE);
  }, [banner.data]);

  const publish = useMutation({
    mutationFn: (data: BannerData) =>
      trpcClient.admin.dashboard.updateBanner.mutate({ bannerObject: data }),
    onSuccess: (_data, variables) => {
      toast.success(variables.enabled ? "Announcement published" : "Announcement hidden");
      void queryClient.invalidateQueries({ queryKey: trpc.admin.dashboard.getBanner.queryKey() });
    },
    onError: (_error, variables) => {
      retryToast("The announcement did not publish", () => publish.mutate(variables));
    },
  });

  const validate = () => (enabled && !text.trim() ? MESSAGE_ERROR : undefined);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextError = validate();
    setError(nextError);
    if (nextError) {
      document.getElementById(messageId)?.focus();
      return;
    }
    publish.mutate({
      text: text.trim(),
      type,
      enabled,
      panel: panel === NONE ? undefined : panel,
    });
  };

  return (
    <section aria-labelledby="dash-announcement" className="space-y-[13px]">
      <Eyebrow id="dash-announcement">Announcement</Eyebrow>
      {banner.isPending ? (
        <div aria-busy className="prism-glass-clear !rounded-prism-21 p-5">
          <Skeleton delayMs={400} className="h-6 w-40" />
          <Skeleton delayMs={400} className="mt-4 h-11 w-full" />
        </div>
      ) : banner.isError ? (
        <ErrorCard
          title="Announcement did not load"
          cause="Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void banner.refetch()}
        />
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          className="prism-glass-clear grid gap-5 !rounded-prism-21 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,508px)] [&>*]:min-w-0"
        >
          <div className="min-w-0 space-y-[13px]">
            <Checkbox checked={enabled} onCheckedChange={setEnabled}>
              Show on the editor
            </Checkbox>
            <div className="space-y-2">
              <label
                htmlFor={messageId}
                className="block text-prism-label font-semibold text-prism-ink"
              >
                Message
                {enabled && <span className="font-normal text-prism-ink-2"> (Required)</span>}
              </label>
              <div className="prism-well flex h-touch items-center px-3">
                <input
                  id={messageId}
                  value={text}
                  maxLength={240}
                  onChange={event => {
                    setText(event.target.value);
                    if (error) setError(undefined);
                  }}
                  onBlur={() => setError(validate())}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${messageId}-error` : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink focus:outline-none"
                />
              </div>
              <FieldError id={`${messageId}-error`}>{error}</FieldError>
            </div>
            <div className="flex flex-wrap gap-5">
              <div className="space-y-2">
                <p className="text-prism-label font-semibold text-prism-ink">Type</p>
                <ChipGroup label="Type" options={TYPES} value={type} onChange={setType} />
              </div>
              <div className="min-w-[233px] flex-1 space-y-2">
                <p id="banner-link-label" className="text-prism-label font-semibold text-prism-ink">
                  Link to
                </p>
                <Select value={panel} onValueChange={value => setPanel(value as BannerLivePanel)}>
                  <SelectTrigger aria-labelledby="banner-link-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {BANNER_LIVE_PANELS.map(value => (
                      <SelectItem key={value} value={value}>
                        {BANNER_PANEL_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-[13px]">
            <p className="text-prism-label font-semibold text-prism-ink">Preview</p>
            {text.trim() ? (
              <Notice variant={type} role="status">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p>{text}</p>
                    {panel !== NONE && (
                      <span className="mt-2 inline-flex h-touch items-center font-semibold text-prism-nav">
                        Open {BANNER_PANEL_LABELS[panel]}
                      </span>
                    )}
                  </div>
                  <X aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-prism-ink-2" />
                </div>
              </Notice>
            ) : (
              <p className="prism-glass-clear !rounded-prism-13 p-3 text-prism-body text-prism-ink-2">
                The preview shows here once you write a message.
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[34ch] text-prism-meta text-prism-ink-2">
                Creators see this under the top bar until they dismiss it. Nothing reaches them
                until you publish.
              </p>
              <Button
                type="submit"
                size="lg"
                disabled={publish.isPending}
                aria-busy={publish.isPending || undefined}
              >
                <Megaphone aria-hidden />
                Publish
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
