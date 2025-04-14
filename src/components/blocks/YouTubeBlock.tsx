import { Youtube } from 'lucide-react';
import type { ThemeConfig } from '../../types/editor';
import { MediaBlock } from '@/api/api.types';

interface YouTubeBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

function getYouTubeVideoId(url: string): string | null {
  let videoId = '';
  try {
    const videoUrl = new URL(url);
    videoId = videoUrl.searchParams.get('v') || '';
    if (videoId === '') {
      videoId = url.split('/').at(-1) || '';
    }
    return videoId;
  } catch {
    return null;
  }
}

export function YouTubeBlock({ block, theme }: YouTubeBlockProps) {
  const videoId = block.config.content ? getYouTubeVideoId(block.config.content) : null;

  if (!block.config.content || !videoId || videoId === '') {
    return (
      <div className="w-full p-6 rounded-lg bg-[#FF0000]/10 border-2 border-dashed border-[#FF0000]/20 flex flex-col items-center justify-center space-y-2">
        <Youtube className="w-8 h-8 text-[#FF0000]" />
        <p className="text-sm text-[#FF0000]" style={{ fontFamily: theme.fontFamily }}>
          Add a YouTube video URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Youtube className="w-4 h-4 text-[#FF0000]" />
        <span
          className="text-sm font-medium text-[#FF0000]"
          style={{ fontFamily: theme.fontFamily }}
        >
          YouTube
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg aspect-video">
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="w-full"
        />
      </div>
    </div>
  );
}
