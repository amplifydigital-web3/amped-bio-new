import { useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Camera, Loader2, Trash2, Upload } from "lucide-react";
import { ALLOWED_AVATAR_FILE_TYPES, ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS } from "@repo/constants";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  cn,
  trpc,
  trpcClient,
  useAuth,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { useOpenParam } from "@/hooks/useOpenParam";
import { CropDialog } from "./CropDialog";

// Screen Review 017. The photo is the control: an 89 circle that opens a menu
// (Upload photo, Remove photo), accepts a dropped file, uploads in place and
// shows plain errors with Retry underneath.

type PhotoError = { message: string; retry?: File };

const TYPE_ERROR = "Use a JPG, PNG or SVG file.";

async function uploadPhoto(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const presigned = await trpcClient.upload.requestAvatarPresignedUrl.mutate({
    contentType: file.type,
    fileExtension: extension,
    fileSize: file.size,
    category: "profiles",
  });
  const response = await fetch(presigned.presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
  const result = await trpcClient.upload.confirmProfilePictureUpload.mutate({
    fileId: presigned.fileId,
    fileName: file.name,
    category: "profiles",
  });
  return result.profilePictureUrl;
}

export function PhotoControl({ describedBy }: { describedBy?: string }) {
  const { profile, setProfile } = useEditor();
  const { refreshUserData } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<PhotoError | null>(null);
  const [dragging, setDragging] = useState(false);
  const { data: limits, isSuccess: limitsLoaded } = useQuery(trpc.upload.getLimits.queryOptions());

  const limitMb = limits?.maxAvatarFileSize
    ? Math.round(limits.maxAvatarFileSize / (1024 * 1024))
    : null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const errorId = "photo-error";

  // Home checklist step 2 lands here with the photo picker open (015 I06). The
  // click carries the activation from the checklist press; focus is the fallback.
  useOpenParam("photo", () => {
    triggerRef.current?.scrollIntoView({ block: "center" });
    triggerRef.current?.focus();
    if (!profile.photoUrl) inputRef.current?.click();
  });
  const photo = uploading ?? profile.photoUrl;
  const initial = (profile.handle || profile.name || "?").charAt(0).toUpperCase();

  // 017 I03: check the size only once the limit is known; the server decides otherwise
  const choose = (file: File) => {
    setError(null);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (
      !ALLOWED_AVATAR_FILE_TYPES.includes(file.type) ||
      !ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.includes(extension)
    ) {
      setError({ message: TYPE_ERROR });
      return;
    }
    if (limitsLoaded && limits?.maxAvatarFileSize && file.size > limits.maxAvatarFileSize) {
      setError({ message: `Use a photo under ${limitMb} MB.` });
      return;
    }
    setPending(file);
  };

  const upload = async (file: File, previewUrl?: string) => {
    setUploading(previewUrl ?? URL.createObjectURL(file));
    setError(null);
    try {
      const url = await uploadPhoto(file);
      setProfile({ ...profile, photoUrl: url });
      await refreshUserData();
    } catch (e) {
      console.error("Photo upload failed:", e instanceof Error ? e.message : e);
      setError({ message: "Photo did not upload. Check your connection.", retry: file });
    } finally {
      setUploading(null);
    }
  };

  const remove = () => {
    const previous = profile.photoUrl ?? "";
    setProfile({ ...profile, photoUrl: "" });
    toast.add({
      type: "info",
      title: "Photo removed",
      duration: 8000,
      actionProps: {
        children: "Undo",
        onClick: () => setProfile({ ...profile, photoUrl: previous }),
      },
    });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) choose(file);
  };

  const circle = (
    <>
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="prism-lens-thumb flex h-full w-full items-center justify-center text-[26px] font-bold leading-[33px] text-prism-nav-pressed">
          {initial}
        </span>
      )}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-white/55">
          <Loader2
            aria-hidden
            className="h-[21px] w-[21px] animate-spin text-prism-nav motion-reduce:animate-none"
          />
        </span>
      )}
    </>
  );

  const badge = (
    <span
      aria-hidden
      className="prism-icon-btn absolute -bottom-[8px] -right-[8px] !h-[34px] !w-[34px]"
    >
      {dragging ? (
        <Upload className="h-[21px] w-[21px] text-prism-ink-2" />
      ) : (
        <Camera className="h-[21px] w-[21px] text-prism-ink-2" />
      )}
    </span>
  );

  const circleClass = cn(
    "prism-focus relative h-[89px] w-[89px] shrink-0 rounded-full transition-[filter] duration-prism-hover hover:brightness-105",
    dragging && "shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]"
  );

  return (
    <div className="space-y-2">
      <div
        onDragEnter={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="relative h-[89px] w-[89px]"
      >
        {photo && !uploading ? (
          <Menu>
            <MenuTrigger
              ref={triggerRef}
              aria-label="Change profile photo"
              aria-describedby={error ? errorId : describedBy}
              className={circleClass}
            >
              <span className="block h-full w-full overflow-hidden rounded-full">{circle}</span>
              {badge}
            </MenuTrigger>
            <MenuContent align="start" className="w-[233px]">
              <MenuItem onSelect={() => inputRef.current?.click()}>
                <Upload aria-hidden />
                Upload photo
              </MenuItem>
              <MenuItem onSelect={remove}>
                <Trash2 aria-hidden />
                Remove photo
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            aria-label={uploading ? "Uploading photo" : "Add profile photo"}
            aria-busy={!!uploading}
            aria-describedby={error ? errorId : describedBy}
            disabled={!!uploading}
            onClick={() => inputRef.current?.click()}
            className={circleClass}
          >
            <span className="block h-full w-full overflow-hidden rounded-full">{circle}</span>
            {badge}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_AVATAR_FILE_TYPES.join(",")}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) choose(file);
          }}
        />
      </div>

      <p className="text-prism-meta text-prism-ink-2">
        JPG, PNG or SVG.{limitMb ? ` Up to ${limitMb} MB.` : ""}
      </p>
      {error && (
        <div id={errorId} role="alert" className="space-y-1">
          <p className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
            <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
            {error.message}
          </p>
          {error.retry && (
            <Button variant="ghost" onClick={() => void upload(error.retry!)}>
              Retry
            </Button>
          )}
        </div>
      )}

      {pending && (
        <CropDialog
          file={pending}
          onCancel={() => setPending(null)}
          onUse={(cropped, previewUrl) => {
            setPending(null);
            void upload(cropped, previewUrl);
          }}
        />
      )}
    </div>
  );
}
