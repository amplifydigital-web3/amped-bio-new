import React, { useState, useRef } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import { Slider } from "../../ui/Slider";
import { Button } from "../../ui/Button";
import "react-image-crop/dist/ReactCrop.css";

interface PhotoEditorProps {
  imageUrl: string;
  onComplete: (editedImage: string) => void;
  onCancel: () => void;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function PhotoEditor({ imageUrl, onComplete, onCancel }: PhotoEditorProps) {
  const [crop, setCrop] = useState<Crop>();
  const [zoom, setZoom] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  };

  const handleSave = () => {
    if (!imageRef.current || !crop || !canvasRef.current) return;

    const image = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to desired output size (250x250 for profile photo)
    const size = 250;
    canvas.width = size;
    canvas.height = size;

    // Calculate source and destination rectangles
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const sourceX = (crop.x * scaleX * image.width) / 100;
    const sourceY = (crop.y * scaleY * image.height) / 100;
    const sourceWidth = (crop.width * scaleX * image.width) / 100;
    const sourceHeight = (crop.height * scaleY * image.height) / 100;

    // Apply zoom
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, size, size);

    // Convert canvas to data URL and save with 80% quality
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    onComplete(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 md:max-w-2xl w-full mx-0 md:mx-4 h-full md:h-auto flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Edit Photo</h3>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>

        <div className="space-y-6 flex-grow flex flex-col">
          <div className="relative flex-grow flex items-center justify-center">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              aspect={1}
              circularCrop
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Crop me"
                className="max-h-[60vh] w-auto mx-auto"
                onLoad={onImageLoad}
                style={{ transform: `scale(${zoom})` }}
              />
            </ReactCrop>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Zoom</label>
            <Slider min={0.5} max={3} step={0.1} value={zoom} onChange={setZoom} />
          </div>
        </div>

        {/* Hidden canvas for processing the image */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
