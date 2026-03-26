import { useRef } from 'react';

const ImageUploadButton = ({
  onSelect,
  children,
  className,
}: {
  onSelect: (file: File, previewUrl: string) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const prevBlobUrl = useRef<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
    }
    const previewUrl = URL.createObjectURL(file);
    prevBlobUrl.current = previewUrl;
    onSelect(file, previewUrl);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <button onClick={() => inputRef.current?.click()} className={className}>
        {children}
      </button>
    </>
  );
};

export default ImageUploadButton;
