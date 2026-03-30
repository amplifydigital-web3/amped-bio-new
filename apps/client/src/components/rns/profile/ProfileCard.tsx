import { Button } from "@/components/ui/Button";
import { domainName } from "@/utils/rns";
import { Camera, Copy, ExternalLink, Loader, Plus, Save, Trash2, X } from "lucide-react";
import ImageUploadButton from "../ui/ImageUploadButton";
import { useSignedUpload } from "@/hooks/rns/useSignedUpload";
import { ProfileUpdates, useProfileRecords } from "@/hooks/rns/useProfileRecords";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import BannerEditorModal, { BannerFit, BannerState } from "./BannerEditorModal";

function parseBannerMeta(raw: string | undefined): {
  bannerFit: BannerFit;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerScale: number;
} {
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        bannerFit: parsed.fit === "contain" ? "contain" : "cover",
        bannerFocusX: typeof parsed.focusX === "number" ? parsed.focusX : 50,
        bannerFocusY: typeof parsed.focusY === "number" ? parsed.focusY : 50,
        bannerScale: typeof parsed.scale === "number" ? parsed.scale : 1,
      };
    }
  } catch {
    // malformed JSON — fall through to defaults
  }
  return { bannerFit: "cover", bannerFocusX: 50, bannerFocusY: 50, bannerScale: 1 };
}

interface ProfileCardProps {
  name: string;
  addressFull: string;
  addressFormatted: string;
  expiry: string;
  isCurrentOwner: boolean;
  onTabChange?: (tab: "details" | "ownership" | "identity") => void;
  textRecords?: Record<string, string>;
  textRecordsLoading?: boolean;
  onSaved?: () => void;
}

interface ProfileData {
  bio: string;
  websites: string[];
  avatarFile: File | null; // pending file to upload on save
  avatarUrl: string | null; // blob URL while pending upload, CDN URL otherwise
  bannerFile: File | null; // pending file to upload on save
  bannerUrl: string | null; // blob URL while pending upload, CDN URL otherwise
  bannerFit: BannerFit;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerScale: number;
}

const INITIAL: ProfileData = {
  bio: "",
  websites: [],
  avatarFile: null,
  avatarUrl: null,
  bannerFile: null,
  bannerUrl: null,
  bannerFit: "cover",
  bannerFocusX: 50,
  bannerFocusY: 50,
  bannerScale: 1,
};

const TagBox = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-gray-50 rounded-xl p-3 flex items-center">
    <span className="text-gray-500 font-semibold mr-3">{label}</span>
    <span className="font-normal text-gray-800">{value}</span>
  </div>
);

const toBannerState = (data: ProfileData): BannerState => ({
  bannerUrl: data.bannerUrl,
  bannerFile: data.bannerFile,
  bannerFit: data.bannerFit,
  bannerFocusX: data.bannerFocusX,
  bannerFocusY: data.bannerFocusY,
  bannerScale: data.bannerScale,
});

const applyBannerState = (data: ProfileData, state: BannerState): ProfileData => ({
  ...data,
  ...state,
});

export const ProfileCard = ({
  name,
  addressFull,
  addressFormatted,
  expiry,
  isCurrentOwner,
  onTabChange,
  textRecords,
  textRecordsLoading,
  onSaved,
}: ProfileCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [saved, setSaved] = useState<ProfileData>(INITIAL);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);
  const [draft, setDraft] = useState<ProfileData>(INITIAL);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const resolvedUrlsRef = useRef<{ avatar?: string | null; banner?: string | null }>({});

  useEffect(() => {
    if (!textRecords) return;
    const avatarUrl = textRecords["avatar"] ?? null;
    const bannerUrl = textRecords["banner"] ?? null;
    setSaved({
      bio: textRecords["description"] ?? "",
      websites: textRecords["url"]
        ? textRecords["url"]
            .split(",")
            .map(w => w.trim())
            .filter(Boolean)
        : [],
      avatarFile: null,
      avatarUrl,
      bannerFile: null,
      bannerUrl,
      ...parseBannerMeta(textRecords["banner.meta"]),
    });
  }, [textRecords]);

  const { setRecords, txHash, isPending, isConfirming, isConfirmed } = useProfileRecords(name);
  const { uploadAll } = useSignedUpload();

  useEffect(() => {
    if (!isConfirmed) return;
    const d = draftRef.current;
    const r = resolvedUrlsRef.current;
    setSaved({
      ...d,
      avatarFile: null,
      avatarUrl: "avatar" in r ? (r.avatar ?? null) : d.avatarUrl,
      bannerFile: null,
      bannerUrl: "banner" in r ? (r.banner ?? null) : d.bannerUrl,
      websites: d.websites.filter(w => w.trim()),
    });
    resolvedUrlsRef.current = {};
    setIsEditing(false);
    toast.success("Profile Updated");
    onSaved?.();
  }, [isConfirmed, txHash]);

  const openEdit = () => {
    setDraft({ ...saved, websites: [...saved.websites] });
    setIsEditing(true);
  };
  const cancelEdit = () => setIsEditing(false);

  const handleSave = async () => {
    const updates: ProfileUpdates = {};

    let resolvedAvatarUrl: string | null = draft.avatarFile ? null : draft.avatarUrl;
    let resolvedBannerUrl: string | null = draft.bannerFile ? null : draft.bannerUrl;

    const hasImageUploads = draft.avatarFile || draft.bannerFile;
    if (hasImageUploads) {
      setIsUploadingImages(true);
      try {
        const uploads: { avatar?: File; banner?: File } = {};
        if (draft.avatarFile) uploads.avatar = draft.avatarFile;
        if (draft.bannerFile) uploads.banner = draft.bannerFile;
        const uploadedUrls = await uploadAll(domainName(name), uploads);
        if (uploadedUrls.avatar) resolvedAvatarUrl = uploadedUrls.avatar;
        if (uploadedUrls.banner) resolvedBannerUrl = uploadedUrls.banner;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Image upload failed";
        toast.error(msg);
        setIsUploadingImages(false);
        return;
      }
      setIsUploadingImages(false);
    }

    resolvedUrlsRef.current = {};
    if (draft.avatarFile || draft.avatarUrl !== saved.avatarUrl)
      resolvedUrlsRef.current.avatar = resolvedAvatarUrl;
    if (draft.bannerFile || draft.bannerUrl !== saved.bannerUrl)
      resolvedUrlsRef.current.banner = resolvedBannerUrl;

    if (resolvedAvatarUrl !== saved.avatarUrl) updates.avatar = resolvedAvatarUrl ?? "";
    if (resolvedBannerUrl !== saved.bannerUrl) updates.banner = resolvedBannerUrl ?? "";
    if (draft.bio.trim() !== saved.bio) updates.bio = draft.bio.trim();
    const newWebsiteStr = draft.websites.filter(w => w.trim()).join(",");
    const savedWebsiteStr = saved.websites.join(",");
    if (newWebsiteStr !== savedWebsiteStr) updates.website = newWebsiteStr;
    const bannerMetaChanged =
      draft.bannerFit !== saved.bannerFit ||
      draft.bannerFocusX !== saved.bannerFocusX ||
      draft.bannerFocusY !== saved.bannerFocusY ||
      draft.bannerScale !== saved.bannerScale;
    if (bannerMetaChanged)
      updates.bannerMeta = JSON.stringify({
        fit: draft.bannerFit,
        focusX: draft.bannerFocusX,
        focusY: draft.bannerFocusY,
        scale: draft.bannerScale,
      });

    if (Object.keys(updates).length === 0) {
      setIsEditing(false);
      return;
    }
    await setRecords(updates);
  };

  const display = isEditing ? draft : saved;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [display.avatarUrl]);
  useEffect(() => {
    setBannerLoadFailed(false);
  }, [display.bannerUrl]);

  const bannerBgStyle = (data: ProfileData): React.CSSProperties => {
    if (!data.bannerUrl || bannerLoadFailed) return {};
    return {
      backgroundImage: `url(${data.bannerUrl})`,
      backgroundSize:
        data.bannerFit === "contain"
          ? "contain"
          : data.bannerScale === 1
            ? "cover"
            : `${data.bannerScale * 100}%`,
      backgroundPosition: `${data.bannerFocusX}% ${data.bannerFocusY}%`,
      backgroundRepeat: "no-repeat",
    };
  };

  const normalizeWebsiteUrl = (w: string) => {
    const v = w.trim();
    if (!v) return "#";
    return v.startsWith("http://") || v.startsWith("https://") ? v : `https://${v}`;
  };

  return (
    <main className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8">
      {/* Profile Header Card */}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="h-24 sm:h-32 md:h-36 relative overflow-hidden group">
          {/* Gradient is always the base layer — shows during load and on error */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-indigo-400 to-blue-400" />
          {display.bannerUrl && !bannerLoadFailed && (
            <>
              <div className="absolute inset-0" style={bannerBgStyle(display)} />
              <img
                src={display.bannerUrl}
                alt=""
                aria-hidden
                className="sr-only"
                onError={() => setBannerLoadFailed(true)}
              />
            </>
          )}

          {isEditing && (
            <button
              onClick={() => setIsBannerModalOpen(true)}
              className="absolute inset-0 z-10 flex items-center justify-center
                         bg-black/0 group-hover:bg-black/40 transition-colors duration-200"
            >
              <span
                className="flex items-center gap-2
                               opacity-0 group-hover:opacity-100 transition-opacity duration-200
                               bg-white/20 backdrop-blur-sm text-white text-sm font-medium
                               px-4 py-2 rounded-lg border border-white/30"
              >
                <Camera className="w-4 h-4" />
                Edit banner
              </span>
            </button>
          )}
        </div>

        <BannerEditorModal
          isOpen={isBannerModalOpen}
          initial={toBannerState(draft)}
          onClose={() => setIsBannerModalOpen(false)}
          onSave={state => {
            setDraft(p => applyBannerState(p, state));
            setIsBannerModalOpen(false);
          }}
        />
        <div className="px-4 sm:px-6 pb-6 rounded-2xl relative py-16 border border-gray-200">
          <div className="absolute left-6 sm:left-8 -top-16 group z-20">
            <div className="relative w-32 h-32 rounded-full ring-8 ring-white overflow-hidden bg-gradient-to-br from-green-300 to-green-100">
              {display.avatarUrl && !avatarLoadFailed && (
                <img
                  src={display.avatarUrl}
                  alt="Avatar"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setAvatarLoadFailed(true)}
                />
              )}
              {isEditing && (
                <ImageUploadButton
                  onSelect={(file, previewUrl) =>
                    setDraft(p => ({
                      ...p,
                      avatarFile: file,
                      avatarUrl: previewUrl,
                    }))
                  }
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full"
                >
                  <Camera className="w-5 h-5 text-white" />
                </ImageUploadButton>
              )}
            </div>
            {isEditing && draft.avatarUrl && !isUploadingImages && !isPending && !isConfirming && (
              <button
                onClick={() => setDraft(p => ({ ...p, avatarFile: null, avatarUrl: null }))}
                title="Remove avatar"
                className="absolute bottom-1 right-1 z-20 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md ring-2 ring-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 mt-4">
            <div className="block absolute right-2 sm:right-6 top-4">
              {/* <VerificationBadge /> */}
            </div>

            <div className="flex flex-col mt-4 w-full min-w-0">
              <h2 className="text-sm sm:text-xl font-bold text-gray-900 mb-1 break-all">
                {domainName(name)}
              </h2>
              {isEditing ? (
                <>
                  <textarea
                    value={draft.bio}
                    onChange={e => setDraft({ ...draft, bio: e.target.value })}
                    placeholder="Write a short bio..."
                    maxLength={160}
                    rows={2}
                    className="mt-3 w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-gray-400 transition"
                  />

                  <div className="mt-3 space-y-2">
                    {draft.websites.map((website, index) => (
                      <div key={`website-${index}`} className="flex items-center gap-2">
                        <input
                          type="url"
                          value={website}
                          onChange={e => {
                            const updated = [...draft.websites];
                            updated[index] = e.target.value;
                            setDraft({ ...draft, websites: updated });
                          }}
                          placeholder={`Website ${index + 1}`}
                          className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-gray-400 transition"
                        />
                        <button
                          onClick={() =>
                            setDraft({
                              ...draft,
                              websites: draft.websites.filter((_, i) => i !== index),
                            })
                          }
                          className="h-9 w-9 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {draft.websites.length < 2 && (
                      <button
                        onClick={() => setDraft({ ...draft, websites: [...draft.websites, ""] })}
                        className="text-sm font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add website link
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-end mt-2">
                    <Button
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={isUploadingImages || isPending || isConfirming}
                      className="flex items-center"
                    >
                      <X className="w-4 h-4 mr-1.5" /> Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isUploadingImages || isPending || isConfirming}
                      className="flex items-center"
                    >
                      {isUploadingImages ? (
                        <>
                          <Loader className="w-4 h-4 mr-1.5 animate-spin" />
                          Uploading images…
                        </>
                      ) : isPending || isConfirming ? (
                        <>
                          <Loader className="w-4 h-4 mr-1.5 animate-spin" />
                          {isPending ? "Confirm in wallet…" : "Saving…"}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-1.5" /> Save Profile
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {textRecordsLoading ? (
                    <div className="mt-2 flex gap-2 animate-pulse">
                      <div className="h-3 bg-gray-200 rounded w-48" />
                      <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                  ) : (
                    saved.bio && (
                      <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-xl">
                        {saved.bio}
                      </p>
                    )
                  )}
                  {!textRecordsLoading && saved.websites.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {saved.websites.map((website, index) => (
                        <a
                          key={`saved-website-${index}`}
                          href={normalizeWebsiteUrl(website)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors break-all"
                        >
                          {website}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200 mt-4">
          <h2 className="font-bold text-gray-400 mb-4">Addresses</h2>
          <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-8 inline-flex items-center gap-2 w-auto">
            <span className="font-mono text-md mr-2">{addressFormatted}</span>
            <Copy
              className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-muted-foreground/60"
              onClick={() => navigator.clipboard.writeText(addressFull)}
            />
          </div>

          <div className="flex items-center mb-4">
            <h2 className="font-bold text-gray-400">Ownership</h2>
            <span className="text-blue-500 mx-2">→</span>
            <button
              onClick={() => onTabChange?.("ownership")}
              className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium text-sm"
            >
              View
            </button>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <TagBox label="manager" value={addressFormatted} />
            <TagBox label="owner" value={addressFormatted} />
            <TagBox label="expiry" value={expiry} />
            <TagBox label="parent" value="eth" />
          </div>

          {isCurrentOwner && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:justify-end">
              <Button variant="default" onClick={openEdit} disabled={isEditing}>
                Edit Profile
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
