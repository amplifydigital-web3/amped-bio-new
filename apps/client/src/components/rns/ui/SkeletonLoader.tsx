import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'text' | 'card' | 'avatar' | 'button' | 'input' | 'pill';
  width?: string;
  height?: string;
  className?: string;
  count?: number;
  animated?: boolean;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
  animated = true
}) => {
  const baseClasses = `bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 
    ${animated ? 'animate-shimmer' : ''} ${className}`;

  const variants = {
    text: 'h-4 rounded-md',
    card: 'h-48 rounded-2xl',
    avatar: 'w-12 h-12 rounded-full',
    button: 'h-12 rounded-xl',
    input: 'h-14 rounded-2xl',
    pill: 'h-10 rounded-full'
  };

  const getStyle = () => {
    const style: React.CSSProperties = {};
    if (width) style.width = width;
    if (height) style.height = height;
    return style;
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`${baseClasses} ${variants[variant]}`}
          style={getStyle()}
        />
      ))}
    </>
  );
};

interface SkeletonSearchResultProps {
  animated?: boolean;
}

export const SkeletonSearchResult: React.FC<SkeletonSearchResultProps> = ({ animated = true }) => {
  return (
    <div className="px-6 py-4 flex justify-between items-center space-x-4">
      <div className="flex-1 space-y-2">
        <SkeletonLoader variant="text" width="60%" animated={animated} />
        <SkeletonLoader variant="text" width="40%" animated={animated} />
      </div>
      <SkeletonLoader variant="pill" width="100px" animated={animated} />
    </div>
  );
};

interface SkeletonNameCardProps {
  animated?: boolean;
}

export const SkeletonNameCard: React.FC<SkeletonNameCardProps> = ({ animated = true }) => {
  return (
    <div className="bg-white rounded-3xl p-6 space-y-4 border border-gray-100">
      <div className="flex items-center space-x-4">
        <SkeletonLoader variant="avatar" animated={animated} />
        <div className="flex-1 space-y-2">
          <SkeletonLoader variant="text" width="50%" animated={animated} />
          <SkeletonLoader variant="text" width="30%" animated={animated} />
        </div>
      </div>
      <SkeletonLoader variant="text" count={3} className="mb-2" animated={animated} />
      <div className="flex space-x-2">
        <SkeletonLoader variant="button" width="100px" animated={animated} />
        <SkeletonLoader variant="button" width="100px" animated={animated} />
      </div>
    </div>
  );
};

export default SkeletonLoader;