import React, { useState, useRef } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { Slider } from '../../ui/Slider';
import { Button } from '../../ui/Button';
import 'react-image-crop/dist/ReactCrop.css';

interface PhotoEditorProps {
  imageUrl: string;
  onSave: (editedImage: string) => void;
  onCancel: () => void;
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export function PhotoEditor({ imageUrl, onSave, onCancel }: PhotoEditorProps) {
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to desired output size (e.g., 400x400 for profile photo)
    const size = 400;
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
    ctx.save();
    ctx.scale(zoom, zoom);
    
    // Draw the cropped image
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      size,
      size
    );
    
    ctx.restore();

    // Convert canvas to data URL and save
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Edit Photo</h3>
        
        <div className="space-y-6">
          <div className="relative">
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
            <label className="block text-sm font-medium text-gray-700">
              Zoom
            </label>
            <Slider
              min={0.5}
              max={3}
              step={0.1}
              value={zoom}
              onChange={setZoom}
            />
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>

        {/* Hidden canvas for processing the image */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
      </div>
    </div>
  );
}