import type { Background } from '../types/editor';

import abstractWaves from '../assets/videos/abstract_waves.mp4';
import gradientLines from '../assets/videos/gradient_lines.mp4';
import inkFlow from '../assets/videos/ink_flow.mp4';
import oceanWaves from '../assets/videos/ocean_waves.mp4';
import floatingParticles from '../assets/videos/floating_particles.mp4';

export const gradients: Background[] = [
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
    label: 'Aurora Gradient',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5',
    label: 'Sunset Gradient',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d',
    label: 'Ocean Gradient',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1579546929662-711aa81148cf',
    label: 'Neon Gradient',
  },
];

export const photos: Background[] = [
  // Nature & Landscapes
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e',
    label: 'Mountain Sunset',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c',
    label: 'Starry Night',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07',
    label: 'Forest Path',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5',
    label: 'Northern Lights',
  },
  // Abstract & Patterns
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1550859492-d5da9d8e45f3',
    label: 'Abstract Waves',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7',
    label: 'Liquid Art',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?v=2',
    label: 'Color Flow',
  },
  // Urban & Architecture
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000',
    label: 'City Lights',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1444723121867-7a241cacace9',
    label: 'Night City',
  },
  // Minimal & Clean
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1507908708918-778587c9e563',
    label: 'Minimal White',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1557683311-eac922347aa1',
    label: 'Clean Lines',
  },
  // Technology
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1518770660439-4636190af475',
    label: 'Tech Grid',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5',
    label: 'Digital Rain',
  },
  // Space & Cosmos
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413',
    label: 'Galaxy',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a',
    label: 'Nebula',
  },
  // Artistic
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb',
    label: 'Paint Splash',
  },
  // Web3 & Crypto
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0',
    label: 'Blockchain',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1644143379190-08a5f055de1d',
    label: 'Crypto Art',
  },
  // Futuristic
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa',
    label: 'Future City',
  },
  {
    type: 'image',
    value: 'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2',
    label: 'Neon Future',
  },
];

export const videos: Background[] = [
  {
    type: 'video',
    value: inkFlow,
    label: 'Ink Flow',
  },
  {
    type: 'video',
    value: gradientLines,
    label: 'Gradient Lines',
  },
  {
    type: 'video',
    value: floatingParticles,
    label: 'Floating Particles',
  },
  {
    type: 'video',
    value: oceanWaves,
    label: 'Ocean Waves',
  },
  {
    type: 'video',
    value: abstractWaves,
    label: 'Abstract Waves',
  },
];

export const backgroundColors: Background[] = [
  {
    type: 'color',
    value: 'linear-gradient(to right, #00c6ff, #0072ff)',
    label: 'Blue Gradient',
  },
  {
    type: 'color',
    value: 'linear-gradient(to right, #fc466b, #3f5efb)',
    label: 'Pink Purple',
  },
  {
    type: 'color',
    value: 'linear-gradient(to right, #11998e, #38ef7d)',
    label: 'Green Flow',
  },
  {
    type: 'color',
    value: 'linear-gradient(to right, #f12711, #f5af19)',
    label: 'Warm Flame',
  },
];