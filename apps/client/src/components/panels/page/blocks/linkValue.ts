import { cn } from "@repo/ui";
import { LINK_PLATFORMS, isSocial, resolveLink } from "./blockInfo";

// The Link field's value and its conversions (Screen Review 034, 037 I08).

export interface LinkValue {
  platform: string;
  input: string;
  label: string;
  /** The creator typed in Label; stop prefilling (034 I05) */
  labelTouched: boolean;
}

export function emptyLink(): LinkValue {
  return { platform: "", input: "", label: "", labelTouched: false };
}

export function wellClass(invalid: boolean) {
  return cn(
    "prism-well prism-focus flex h-touch w-full items-center gap-1 px-[13px] focus-within:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
    invalid && "!shadow-[inset_0_0_0_1.5px_#B3261E]"
  );
}

/** The saved config for a valid link value, or null. */
export function linkConfig(value: LinkValue) {
  const platform = value.platform || "custom";
  const url = resolveLink(platform, value.input);
  const label = value.label.trim();
  if (!url || !label) return null;
  return { platform, url, label };
}

/** 037 I08: extraction for editing; a failed extraction shows the full URL as Custom. */
export function linkValueFromConfig(config: { platform: string; url: string; label: string }) {
  const { platform, url, label } = config;
  if (platform === "email") {
    return { platform, input: url.replace(/^mailto:/i, ""), label, labelTouched: true };
  }
  if (isSocial(platform)) {
    const prefix = LINK_PLATFORMS.find(p => p.id === platform)?.url?.replace("{{username}}", "");
    if (prefix && url.startsWith(prefix)) {
      return { platform, input: url.slice(prefix.length), label, labelTouched: true };
    }
    return { platform: "custom", input: url, label, labelTouched: true };
  }
  return { platform, input: url, label, labelTouched: true };
}
