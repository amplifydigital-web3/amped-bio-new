import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Checkbox, ErrorCard, Input, Notice, cn, trpc, trpcClient } from "@repo/ui";
import {
  CREATOR_TRACKING_TERMS_PATH,
  CREATOR_TRACKING_TERMS_VERSION,
  GA4_MEASUREMENT_ID_PATTERN,
  META_PIXEL_ID_PATTERN,
  TIKTOK_PIXEL_ID_PATTERN,
  type TrackingPixelsUpdate,
} from "@repo/constants";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AnalyticsCard } from "./AnalyticsCard";
import { HowTo } from "./HowTo";
import { SkeletonRows } from "./Skeleton";

type IdField = "ga4MeasurementId" | "metaPixelId" | "tiktokPixelId";
type TokenField = "metaCapiToken" | "tiktokEventsToken";
type ProviderKey = "ga4" | "meta" | "tiktok";
type Settings = NonNullable<ReturnType<typeof usePixelSettings>["data"]>;

// Screen Review 093 I38: the intro, verbatim from the pixel how to
const PIXELS_INTRO =
  "You only need this if you run ads or use Google Analytics. Your Amped analytics work without it.";

// Screen Review 093 I40: the responsibility notice, verbatim
const NOTICE_TITLE = "Before you connect a pixel";
const NOTICE_BODY =
  "Visitors will see a consent banner. Pixels load only for visitors who accept, and never for browsers that send a Global Privacy Control signal. You are responsible for how you use data these platforms collect about your visitors.";

const TERMS_URL = `${import.meta.env.VITE_LANDINGPAGE_URL ?? ""}${CREATOR_TRACKING_TERMS_PATH}`;
const TERMS_TITLE = "Creator Analytics and Tracking Terms";

type Provider = {
  key: ProviderKey;
  name: string;
  saveLabel: string;
  id: {
    field: IdField;
    label: string;
    placeholder: string;
    pattern: RegExp;
    // The server schema message, verbatim (packages/constants/src/analytics.ts)
    message: string;
    help: string;
    guide: string[];
  };
  token?: { field: TokenField; label: string; help: string };
};

const PROVIDERS: Provider[] = [
  {
    key: "ga4",
    name: "Google Analytics 4",
    saveLabel: "Save Google Analytics settings",
    id: {
      field: "ga4MeasurementId",
      label: "Google Analytics 4 Measurement ID",
      placeholder: "G-XXXXXXXXXX",
      pattern: GA4_MEASUREMENT_ID_PATTERN,
      message: "Use a GA4 Measurement ID like G-XXXXXXXXXX",
      help: "Google Analytics > Admin > Data streams > your web stream.",
      guide: [
        "Open analytics.google.com and select your property.",
        "Go to Admin, then Data collection and modification, then Data streams.",
        "Open your Web stream. Create one for your amped.bio page URL if you have none.",
        "Copy the Measurement ID. It starts with G-.",
      ],
    },
  },
  {
    key: "meta",
    name: "Meta",
    saveLabel: "Save Meta settings",
    id: {
      field: "metaPixelId",
      label: "Meta Pixel ID",
      placeholder: "123456789012345",
      pattern: META_PIXEL_ID_PATTERN,
      message: "Meta Pixel IDs are 10 to 20 digits",
      help: "Meta Events Manager > Data sources > your pixel.",
      guide: [
        "Open business.facebook.com/events_manager.",
        "Select Data sources and choose your pixel (dataset). Create one if you have none.",
        "Copy the ID shown under the pixel name. It is 15 to 16 digits.",
        "Optional: in Settings, under Conversions API, choose Generate access token and paste it below.",
      ],
    },
    token: {
      field: "metaCapiToken",
      label: "Meta Conversions API access token",
      // Screen Review 093 D2, approved wording
      help: "Optional. With a token, Amped.Bio also sends each consented page view and link click from our server to Meta, with the visitor's IP address, browser details, page address and the link tapped.",
    },
  },
  {
    key: "tiktok",
    name: "TikTok",
    saveLabel: "Save TikTok settings",
    id: {
      field: "tiktokPixelId",
      label: "TikTok Pixel ID",
      placeholder: "C1A2B3C4D5E6F7G8H9I0",
      pattern: TIKTOK_PIXEL_ID_PATTERN,
      message: "TikTok Pixel IDs are 15 to 25 letters and digits",
      help: "TikTok Ads Manager > Tools > Events > Web events.",
      guide: [
        "Open ads.tiktok.com and go to Tools, then Events.",
        "Choose Web events and select your pixel. Create one with manual setup if you have none.",
        "Copy the Pixel ID shown under the pixel name. It is about 20 letters and numbers.",
        "Optional: in Settings, under Events API, choose Generate access token and paste it below.",
      ],
    },
    token: {
      field: "tiktokEventsToken",
      label: "TikTok Events API access token",
      // Screen Review 093 D2, approved wording
      help: "Optional. With a token, Amped.Bio also sends each consented page view and link click from our server to TikTok, with the visitor's IP address, browser details, page address, referring site and the link tapped.",
    },
  },
];

const HOW_TO_STEPS = [
  "Open the guide under each field below to find your ID in Google, Meta or TikTok.",
  "Paste the IDs you have and choose Save. Leave the others empty.",
  "For more reliable ad results, add the optional Meta and TikTok tokens. They send events from our server too.",
  "Open your page in a private window, choose Accept all, and check that the visit shows up in each platform within a few minutes.",
];

function usePixelSettings() {
  return useQuery(trpc.trackingPixels.get.queryOptions());
}

function hasStoredToken(settings: Settings, field: TokenField) {
  return field === "metaCapiToken" ? settings.hasMetaCapiToken : settings.hasTiktokEventsToken;
}

function normalizeId(value: string) {
  return value.trim().toUpperCase();
}

function TermsCheckbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  // Screen Review 093 D2, approved wording
  return (
    <Checkbox checked={checked} onCheckedChange={onCheckedChange} required>
      I accept the{" "}
      <a
        href={TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="prism-focus rounded-prism-5 font-semibold text-prism-nav underline underline-offset-2"
      >
        {TERMS_TITLE}
      </a>
      . I am responsible for how I use the data these platforms collect about my visitors.
      (Required)
    </Checkbox>
  );
}

function useSavePixels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TrackingPixelsUpdate) => trpcClient.trackingPixels.update.mutate(input),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: trpc.trackingPixels.get.queryKey() });
      toast.add({
        type: "success",
        title: input.termsVersion ? "Pixels saved. Terms accepted." : "Tracking settings saved",
      });
    },
  });
}

/** One provider: its disclosure row 55 and, when open, its panel (093 I38 to I40, D2). */
function ProviderRow({
  provider,
  settings,
  open,
  onToggle,
  accepted,
  onAcceptedChange,
}: {
  provider: Provider;
  settings: Settings;
  open: boolean;
  onToggle: () => void;
  accepted: boolean;
  onAcceptedChange: (checked: boolean) => void;
}) {
  const panelId = useId();
  const guideId = useId();
  const stored = settings[provider.id.field] ?? "";
  const connected = !!stored;
  const tokenStored = provider.token ? hasStoredToken(settings, provider.token.field) : false;

  const [idValue, setIdValue] = useState(stored);
  const [idError, setIdError] = useState<string | undefined>();
  const [token, setToken] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const save = useSavePixels();
  const removeToken = useSavePixels();

  const validate = (value: string) =>
    value.trim() && !provider.id.pattern.test(normalizeId(value)) ? provider.id.message : undefined;

  // 093 I37: send only what changed. Undefined keeps the stored value on the server.
  const changes: TrackingPixelsUpdate = {};
  const nextId = normalizeId(idValue);
  if (nextId !== normalizeId(stored)) changes[provider.id.field] = nextId;
  if (provider.token) {
    if (!nextId && tokenStored) changes[provider.token.field] = "";
    else if (nextId && token.trim()) changes[provider.token.field] = token.trim();
  }
  const hasChanges = Object.keys(changes).length > 0;
  const connects = Object.values(changes).some(value => !!value);
  const needsTerms = connects && !settings.termsAccepted;
  const blockedByTerms = needsTerms && !accepted;

  const submit = () => {
    const error = validate(idValue);
    setIdError(error);
    if (error || !hasChanges || blockedByTerms) return;
    setSaveError(undefined);
    save.mutate(
      needsTerms ? { ...changes, termsVersion: CREATOR_TRACKING_TERMS_VERSION } : changes,
      {
        onSuccess: () => {
          setToken("");
          setIdValue(nextId);
        },
        onError: (error: Error) =>
          setSaveError(
            error.message === "Accept the terms to save."
              ? error.message
              : "Could not save tracking settings"
          ),
      }
    );
  };

  return (
    <li className="border-b border-prism-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="prism-focus flex min-h-commit w-full items-center gap-[13px] rounded-prism-8 text-left"
      >
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">
          {provider.name}
        </span>
        {connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <span className="text-prism-meta text-prism-ink-2">Not connected</span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "h-[21px] w-[21px] shrink-0 text-prism-ink-2 transition-transform duration-prism-control motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <form
          id={panelId}
          noValidate
          className="space-y-[21px] pb-[21px] pt-[8px]"
          onSubmit={event => {
            event.preventDefault();
            submit();
          }}
        >
          <div>
            <Notice variant="warning" title={NOTICE_TITLE}>
              <p>{NOTICE_BODY}</p>
            </Notice>
            {!settings.termsAccepted && (
              <div className="mt-2">
                <TermsCheckbox checked={accepted} onCheckedChange={onAcceptedChange} />
              </div>
            )}
          </div>

          <div>
            <Input
              label={provider.id.label}
              value={idValue}
              onChange={event => {
                setIdValue(event.target.value);
                // 093 I39: an error shown on blur clears as soon as the value is valid
                if (idError) setIdError(validate(event.target.value));
              }}
              onBlur={() => setIdError(validate(idValue))}
              placeholder={provider.id.placeholder}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              error={idError}
              helper={provider.id.help}
              className="font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              className="mt-1 -ml-3"
              aria-expanded={guideOpen}
              aria-controls={guideId}
              onClick={() => setGuideOpen(value => !value)}
            >
              Where do I find this?
              <ChevronDown
                aria-hidden
                className={cn(
                  "transition-transform duration-prism-control motion-reduce:transition-none",
                  guideOpen && "rotate-180"
                )}
              />
            </Button>
            {guideOpen && (
              <ol
                id={guideId}
                className="mt-1 list-decimal space-y-1 pl-5 text-prism-body text-prism-ink-2"
              >
                {provider.id.guide.map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>

          {provider.token && (
            <div>
              <Input
                label={provider.token.label}
                type="password"
                autoComplete="off"
                value={token}
                disabled={!nextId}
                onChange={event => setToken(event.target.value)}
                placeholder={
                  tokenStored ? "Saved. Enter a new token to replace it." : "Paste token"
                }
                helper={provider.token.help}
              />
              {tokenStored && (
                <div className="mt-2 flex flex-wrap items-center gap-[13px]">
                  <p className="inline-flex items-center gap-1.5 text-prism-meta text-prism-success">
                    <CheckCircle2 aria-hidden className="h-[21px] w-[21px]" />
                    Server-side events active.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-prism-danger"
                    disabled={removeToken.isPending}
                    aria-busy={removeToken.isPending}
                    onClick={() =>
                      removeToken.mutate(
                        { [provider.token!.field]: "" },
                        {
                          onError: () =>
                            toast.add({ type: "error", title: "Could not remove the token" }),
                        }
                      )
                    }
                  >
                    {removeToken.isPending && (
                      <Loader2 aria-hidden className="motion-safe:animate-spin" />
                    )}
                    Remove token
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:gap-[13px]">
            <Button
              type="submit"
              size="lg"
              disabled={save.isPending || !hasChanges || blockedByTerms}
              aria-busy={save.isPending}
              aria-describedby={blockedByTerms ? `${panelId}-terms` : undefined}
              className="w-full md:w-auto"
            >
              {save.isPending && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
              {provider.saveLabel}
            </Button>
            {blockedByTerms && (
              <p id={`${panelId}-terms`} className="text-prism-meta text-prism-ink-2">
                Accept the terms to save.
              </p>
            )}
          </div>
          {saveError && (
            <p
              role="alert"
              className="-mt-[8px] flex items-start gap-1.5 text-prism-meta text-prism-danger"
            >
              <AlertCircle aria-hidden className="mt-px h-4 w-4 shrink-0" />
              {saveError}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

/**
 * Screen Review 093 D2: creators whose pixels were connected before the terms
 * checkbox existed are asked once, here, the next time they open Analytics.
 */
function AcceptExistingTerms() {
  const [checked, setChecked] = useState(false);
  const save = useSavePixels();
  return (
    <form
      className="prism-notice mb-[21px] font-prism"
      onSubmit={event => {
        event.preventDefault();
        if (checked) save.mutate({ termsVersion: CREATOR_TRACKING_TERMS_VERSION });
      }}
    >
      <p className="text-prism-body font-bold text-prism-warning-ink">
        Accept the {TERMS_TITLE} to keep your pixels connected.
      </p>
      <div className="mt-2">
        <TermsCheckbox checked={checked} onCheckedChange={setChecked} />
      </div>
      <Button
        type="submit"
        className="mt-2"
        disabled={!checked || save.isPending}
        aria-busy={save.isPending}
      >
        {save.isPending && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
        Save
      </Button>
      {save.isError && (
        <p role="alert" className="mt-2 text-prism-meta text-prism-danger">
          Could not save tracking settings
        </p>
      )}
    </form>
  );
}

/**
 * Screen Review 093 I37 to I40 and D2: the Ad pixels section on Campaigns.
 * One provider row opens at a time. Each saves only its own fields, and
 * nothing can be saved until the stored settings have loaded.
 */
export function TrackingPixelsCard() {
  const { data, isLoading, isError, refetch } = usePixelSettings();
  const [openKey, setOpenKey] = useState<ProviderKey | null>(null);
  // One acceptance covers every provider panel in this visit
  const [accepted, setAccepted] = useState(false);

  const anyConnected = !!(data?.ga4MeasurementId || data?.metaPixelId || data?.tiktokPixelId);

  return (
    <AnalyticsCard
      id="pixels"
      title="Ad pixels"
      description={PIXELS_INTRO}
      info="Your pixels receive page views and link clicks from visitors who allow ads and analytics on your page. Tokens are encrypted and never shown again after saving."
    >
      {isError ? (
        // 093 I37: no form and no Save until the stored settings are known
        <ErrorCard
          title="Pixel settings did not load"
          onRetry={() => void refetch()}
          retryLabel="Retry"
        />
      ) : isLoading || !data ? (
        <SkeletonRows count={3} active={isLoading} />
      ) : (
        <>
          {anyConnected && !data.termsAccepted && <AcceptExistingTerms />}
          <ul className="border-t border-prism-line">
            {PROVIDERS.map(provider => (
              <ProviderRow
                key={provider.key}
                provider={provider}
                settings={data}
                open={openKey === provider.key}
                onToggle={() =>
                  setOpenKey(current => (current === provider.key ? null : provider.key))
                }
                accepted={accepted}
                onAcceptedChange={setAccepted}
              />
            ))}
          </ul>
          <HowTo
            storageKey="pixels"
            title="How to connect your pixels"
            steps={HOW_TO_STEPS}
            defaultOpen={!anyConnected}
            className="mt-[21px]"
          />
        </>
      )}
    </AnalyticsCard>
  );
}
