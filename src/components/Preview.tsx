import React from 'react';
import { useEditorStore } from '../store/editorStore';
import { ParticlesBackground } from './particles/ParticlesBackground';
import { cn } from '../utils/cn';
import { getButtonBaseStyle, getContainerStyle, getButtonEffectStyle, getHeroEffectStyle } from '../utils/styles';
import { getPlatformIcon } from '../utils/platforms';
import { MediaBlock } from './blocks/MediaBlock';
import { TextBlock } from './blocks/TextBlock';
import { UserMenu } from './auth/UserMenu';

interface PreviewProps {
  isEditing: boolean;
}

export function Preview(props: PreviewProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  const profile = useEditorStore((state) => state.profile);
  const blocks = useEditorStore((state) => state.blocks);
  const theme = useEditorStore((state) => state.theme.config);
  const { isEditing = false } = props;

  return (
    <>
      {!isEditing && (
        <header className="h-16 border-b bg-white px-6 flex items-center justify-end shrink-0">
          <UserMenu />
        </header>
      )}

      <div className="flex-1 overflow-auto bg-gray-100 relative">
        <div className="min-h-full">
          {/* Background Layer */}
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              background: theme.background.type === 'color'
                ? theme.background.value
                : undefined
            }}
          >
            {theme.background.type === 'video' ? (
              <video
                src={theme.background.value}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : theme.background.type === 'image' ? (
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage: `url(${theme.background.value})`
                }}
              />
            ) : null}
            <div className="absolute inset-0">
              <ParticlesBackground effect={theme.particlesEffect} />
            </div>
          </div>

          {/* Content Layer */}
          <div className={cn(
            'relative min-h-full py-8 px-4 transition-all duration-300 mx-auto z-10',
            isMobile ? 'max-w-[375px]' : 'max-w-[640px]'
          )}>
            {/* Container */}
            <div
              className={cn(
                'w-full space-y-8 p-8',
                getContainerStyle(theme.containerStyle)
              )}
              style={{
                backgroundColor: `${theme.containerColor}${Math.round(theme.transparency * 2.55).toString(16).padStart(2, '0')}`,
              }}
            >
              {/* Profile Section */}

              <div className="flex flex-col items-center text-center space-y-6">
                {profile.photoUrl && (
                  <div className="relative">
                    <img
                      src={profile.photoUrl}
                      alt={profile.name}
                      className="w-32 h-32 rounded-full object-cover ring-4 ring-white/50 shadow-xl"
                    />
                    <div className="absolute -inset-1 rounded-full blur-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30 group-hover:opacity-50 transition-opacity" />
                  </div>
                )}
                {profile.photoCmp && (
                  <div className="relative">
                    <img
                      src={profile.photoCmp}
                      alt={profile.name}
                      className="w-32 h-auto"
                    />
                    {/* <div className="absolute -inset-1 rounded-full blur-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30 group-hover:opacity-50 transition-opacity" /> */}
                  </div>
                )}
                <div className="space-y-4">
                  <h1
                    className={cn(
                      'text-4xl font-bold tracking-tight',
                      getHeroEffectStyle(theme.heroEffect)
                    )}
                    style={{
                      fontFamily: theme.fontFamily,
                      color: theme.fontColor
                    }}
                  >
                    {profile.name}
                  </h1>
                  {profile.title && (
                    <p
                      className="text-xl font-medium"
                      style={{
                        fontFamily: theme.fontFamily,
                        color: theme.fontColor
                      }}
                    >
                      {profile.title}
                    </p>
                  )}
                  {profile.bio && (
                    <p
                      className="text-lg max-w-2xl mx-auto leading-relaxed"
                      style={{
                        fontFamily: theme.fontFamily,
                        color: theme.fontColor,
                        opacity: 0.9
                      }}
                    >
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>


              {/* Links & Blocks */}
              <div className="space-y-4">
                {blocks.map((block) => {
                  if (block.type === 'link') {
                    const Icon = getPlatformIcon(block.platform);
                    return (
                      <a
                        key={block.id}
                        href={block.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'w-full px-4 py-3 flex items-center space-x-3',
                          'transition-all duration-200',
                          getButtonBaseStyle(theme.buttonStyle),
                          getButtonEffectStyle(theme.buttonEffect)
                        )}
                        style={{
                          backgroundColor: theme.buttonColor,
                          fontFamily: theme.fontFamily,
                          fontSize: theme.fontSize,
                          color: theme.fontColor,
                        }}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-center">{block.label}</span>
                      </a>
                    );
                  }
                  if (block.type === 'media') {
                    return (
                      <MediaBlock
                        key={block.id}
                        block={block}
                        theme={theme}
                      />
                    );
                  }
                  return (
                    <TextBlock
                      key={block.id}
                      block={block}
                      theme={theme}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile Toggle */}
          <div className="fixed bottom-16 right-4 z-20">
            <button
              onClick={() => setIsMobile(!isMobile)}
              className="p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50"
            >
              <span className="sr-only">
                {isMobile ? 'Switch to desktop view' : 'Switch to mobile view'}
              </span>
              {isMobile ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}