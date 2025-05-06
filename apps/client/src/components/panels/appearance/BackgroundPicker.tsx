import React, { useCallback, useMemo, memo } from "react";
import { Check, Upload, ExternalLink } from "lucide-react";
import type { Background } from "../../../types/editor";
import { gradients, photos, videos, backgroundColors } from "../../../utils/backgrounds";
import CollapsiblePanelWrapper from "../CollapsiblePanelWrapper";

interface BackgroundPickerProps {
  value: Background;
  onChange: (background: Background) => void;
}

export const BackgroundPicker = memo(({ value, onChange }: BackgroundPickerProps) => {
  const [customURL, setCustomURL] = React.useState("");

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          onChange({
            type: file.type.startsWith("video/") ? "video" : "image",
            value: result,
            label: file.name,
          });
        };
        reader.readAsDataURL(file);
      }
    },
    [onChange]
  );

  const handleURLUpload = (type: "video" | "image") => {
    if (!customURL) return;
    onChange({
      type,
      value: customURL,
      label: "Custom Background",
    });
  };

  const gradientsMemoized = useMemo(() => {
    return gradients.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        <img src={bg.value} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const backgroundColorsMemoized = useMemo(() => {
    return backgroundColors.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative h-24 rounded-lg overflow-hidden group"
        style={{ background: bg.value }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium drop-shadow-md">{bg.label}</span>
        </div>
        {value.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const photosMemoized = useMemo(() => {
    return photos.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        <img src={bg.thumbnail} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const videosMemoized = useMemo(() => {
    return videos.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        {/* <video
          src={bg.value}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        /> */}
        <img src={bg.thumbnail} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Gradients */}
      <CollapsiblePanelWrapper initialOpen={false} title="Gradient Backgrounds">
        <div className="grid grid-cols-2 gap-3">{gradientsMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Color Gradients */}
      <CollapsiblePanelWrapper initialOpen={false} title="Color Gradients">
        <div className="grid grid-cols-2 gap-3">{backgroundColorsMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Photos */}
      <CollapsiblePanelWrapper initialOpen={false} title="Photo Backgrounds">
        <div className="grid grid-cols-2 gap-3">{photosMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Videos */}
      <CollapsiblePanelWrapper initialOpen={false} title="Video Backgrounds">
        <div className="grid grid-cols-2 gap-3">{videosMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Custom File Upload */}
      {/* <CollapsiblePanelWrapper initialOpen={false} title="Custom Background">
        <label className="block">
          <div className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
            <Upload className="w-6 h-6 text-gray-400 mb-2" />
            <span className="text-sm text-gray-500">Upload image or video</span>
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
        </label>
      </CollapsiblePanelWrapper> */}

      {/* Custom URL Upload */}
      <CollapsiblePanelWrapper initialOpen={false} title="Custom Background">
        <label className="block m-2">
          <div className="w-full flex items-center gap-1 mb-1">
            <ExternalLink className="w-6 h-6 text-gray-400" />
            <span className="text-sm text-gray-500">Set image or video URL</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onChange={e => setCustomURL(e.target.value)}
            />
            <div className="w-full flex items-center">
              <button
                onClick={() => handleURLUpload("image")}
                className="w-full px-1 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm hover:bg-gray-300 transition-colors"
              >
                Set as Image
              </button>
              <button
                onClick={() => handleURLUpload("video")}
                className="w-full px-1 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm hover:bg-gray-300 transition-colors"
              >
                Set as Video
              </button>
            </div>
          </div>
        </label>
      </CollapsiblePanelWrapper>
    </div>
  );
});
