import { useState } from "react";
import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import { useEditor } from "@/contexts/EditorContext";
import { PhotoControl } from "./PhotoControl";
import { RevoNameField, RevoNameNotice } from "./RevoNameField";

// Screen Review 017, 018 (D03). The profile header card: photo, Display name,
// the handle, RevoName and Bio in the order visitors read them. Everything
// autosaves (D11); the preview updates as you type.
//
// 022: Import from X lives in this card's overflow menu once a server lookup
// exists. Until then the overflow button is not rendered (D07).

export function ProfileHeaderCard() {
  const { profile, setProfile, setActivePanelAndNavigate } = useEditor();
  const [nameBlurred, setNameBlurred] = useState(false);
  const showRNS = import.meta.env.VITE_SHOW_RNS === "true";

  return (
    <section aria-label="Profile" className="prism-glass-clear space-y-[21px] p-[21px] font-prism">
      <div className="flex items-start gap-[21px]">
        <PhotoControl />
        <div className="min-w-0 flex-1 space-y-[13px]">
          <div className="space-y-2">
            <label
              htmlFor="display-name"
              className="block text-prism-label font-semibold text-prism-ink"
            >
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              autoComplete="name"
              maxLength={55}
              value={profile.name}
              onChange={event => setProfile({ ...profile, name: event.target.value })}
              onBlur={() => setNameBlurred(true)}
              aria-describedby={!profile.name && nameBlurred ? "display-name-help" : undefined}
              className="prism-well prism-focus h-touch w-full px-[13px] text-prism-label text-prism-ink outline-none"
            />
            {!profile.name && nameBlurred && (
              <p id="display-name-help" className="text-prism-meta text-prism-ink-2">
                Visitors see @{profile.handle} when this is empty
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActivePanelAndNavigate("account", undefined, { tab: "settings" })}
            className="prism-focus rounded-prism-8 text-prism-meta text-prism-ink-2 hover:text-prism-nav hover:underline"
          >
            @{profile.handle}
          </button>
        </div>
      </div>

      {showRNS && <RevoNameNotice />}
      {showRNS && <RevoNameField />}

      <div className="space-y-2">
        <p id="bio-label" className="text-prism-label font-semibold text-prism-ink">
          Bio
        </p>
        <SlateEditor
          key={profile.id}
          labelId="bio-label"
          toolbarLabel="Bio formatting"
          placeholder="Tell visitors who you are"
          initialValue={profile.bio}
          minHeight={89}
          maxHeight={233}
          onChange={html => setProfile({ ...profile, bio: html })}
        />
      </div>
    </section>
  );
}
