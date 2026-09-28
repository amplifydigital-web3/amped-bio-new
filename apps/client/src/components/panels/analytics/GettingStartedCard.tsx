import { useState } from "react";
import { CheckCircle2, Circle, Copy, Rocket, X } from "lucide-react";
import { toast } from "react-hot-toast";

const DISMISS_KEY = "amped_analytics_getting_started_dismissed";

type Step = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  action?: { label: string; onClick: () => void; icon?: React.ElementType };
};

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-run checklist for the Analytics tab. Steps tick themselves off from
 * real data, and the card hides once everything required is done or the
 * creator dismisses it.
 */
export function GettingStartedCard({
  handle,
  hasViews,
  hasCampaign,
  hasPixel,
  onGoTo,
}: {
  handle: string;
  hasViews: boolean;
  hasCampaign: boolean;
  hasPixel: boolean;
  onGoTo: (sectionId: string) => void;
}) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const pageUrl = `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}`;

  const steps: Step[] = [
    {
      id: "share",
      title: "Share your page",
      detail:
        "Put your Amped Bio link in your Instagram, TikTok and X bios. Numbers appear here within seconds of the first visit.",
      done: hasViews,
      action: {
        label: "Copy page link",
        icon: Copy,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(pageUrl);
            toast.success("Page link copied");
          } catch {
            toast.error(`Copy failed. Your link is ${pageUrl}`);
          }
        },
      },
    },
    {
      id: "campaign",
      title: "Create a campaign link",
      detail:
        "Use a different link in each place you share. This shows exactly which post or bio sends visitors.",
      done: hasCampaign,
      action: { label: "Go to Campaigns", onClick: () => onGoTo("campaigns") },
    },
    {
      id: "pixels",
      title: "Connect your ad pixels",
      detail:
        "Send visits and clicks to your Google Analytics, Meta or TikTok account. Only needed if you run ads.",
      done: hasPixel,
      optional: true,
      action: { label: "Go to Pixels", onClick: () => onGoTo("pixels") },
    },
    {
      id: "read",
      title: "Check your insights",
      detail:
        "Insights explain what changed and suggest one thing to try. Hover the i icons for what each number means.",
      done: hasViews,
      action: { label: "Go to Insights", onClick: () => onGoTo("insights") },
    },
  ];

  const requiredDone = steps.filter(step => !step.optional).every(step => step.done);
  if (dismissed || requiredDone) return null;

  const doneCount = steps.filter(step => step.done).length;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this visit only
    }
  };

  return (
    <section
      aria-labelledby="getting-started-title"
      className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id="getting-started-title"
            className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"
          >
            <Rocket className="w-4 h-4 text-blue-700" aria-hidden />
            Get started with Analytics
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            {doneCount} of {steps.length} done. Each step takes about a minute.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide getting started"
          className="rounded-md p-1 text-gray-500 hover:bg-white hover:text-gray-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="mt-3 grid gap-2 md:grid-cols-2">
        {steps.map(step => (
          <li
            key={step.id}
            className={`flex gap-3 rounded-lg border bg-white p-3 ${step.done ? "border-emerald-200" : "border-gray-200"}`}
          >
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" aria-label="Done" />
            ) : (
              <Circle className="w-5 h-5 shrink-0 text-gray-300" aria-label="Not done" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {step.title}
                {step.optional && (
                  <span className="ml-1.5 text-[11px] font-normal text-gray-500">Optional</span>
                )}
              </p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{step.detail}</p>
              {step.action && !step.done && (
                <button
                  type="button"
                  onClick={step.action.onClick}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                >
                  {step.action.icon && <step.action.icon className="w-3.5 h-3.5" />}
                  {step.action.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
