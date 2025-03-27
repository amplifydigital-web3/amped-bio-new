import type { Background } from '../types/editor';

const awsS3 = import.meta.env.AWS_S3_BACKGROUNDS || 'https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds';


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
    value: 'https://assets.mixkit.co/active_storage/video_items/99921/1717719102/99921-video-720.mp4',
    label: 'Ink Flow',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/24551/24551-720.mp4',
    label: 'Cloudy Sky',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/35746/35746-720.mp4',
    label: 'Gradient Lines',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/4192/4192-720.mp4',
    label: 'Digital Wall',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/51476/51476-720.mp4',
    label: 'Ocean Waves',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/18305/18305-720.mp4',
    label: 'Make it Rain',
  },
  {
    type: 'video',
    value: 'https://assets.mixkit.co/videos/4067/4067-720.mp4',
    label: 'City Traffic',
  },
  {
    type: 'video',
    value: `${awsS3}/Astral_Staircase.mp4`,
    label: 'Astral Staircase',
  },
  {
    type: 'video',
    value: `${awsS3}/Beach_House.mp4`,
    label: 'Beach House',
  },
  {
    type: 'video',
    value: `${awsS3}/Big_Sky.mov`,
    label: 'Big Sky',
  },
  {
    type: 'video',
    value: `${awsS3}/Bubbles.mp4`,
    label: 'Bubbles',
  },
  {
    type: 'video',
    value: `${awsS3}/Christmas_Ornaments.mov`,
    label: 'Cristmas Ornaments',
  },
  {
    type: 'video',
    value: `${awsS3}/Cube_Wall.mp4`,
    label: 'Cube Wall',
  },
  {
    type: 'video',
    value: `${awsS3}/Cyber_Arches.mov`,
    label: 'Cyber Arches',
  },
  {
    type: 'video',
    value: `${awsS3}/Cyber_Corridor.mp4`,
    label: 'Cyber Corridor',
  },
  {
    type: 'video',
    value: `${awsS3}/Dark_Lighning.mov`,
    label: 'Dark Lightning',
  },
  {
    type: 'video',
    value: `${awsS3}/Dot_Matrix.mp4`,
    label: 'Dot Matrix',
  },
  {
    type: 'video',
    value: `${awsS3}/Ellipse.mp4`,
    label: 'Ellipse',
  },
  {
    type: 'video',
    value: `${awsS3}/Event_Horizon.mp4`,
    label: 'Event Horizon',
  },
  {
    type: 'video',
    value: `${awsS3}/Forest_Sunbeams.mp4`,
    label: 'Forest Sunbeams',
  },
  {
    type: 'video',
    value: `${awsS3}/Fractal_Flower.mov`,
    label: 'Fractal Flower',
  },
  {
    type: 'video',
    value: `${awsS3}/Inferno.mp4`,
    label: 'Inferno',
  },
  {
    type: 'video',
    value: `${awsS3}/Jade_Tunnel.mp4`,
    label: 'Jade Tunnel',
  },
  {
    type: 'video',
    value: `${awsS3}/Kitten.mov`,
    label: 'Kitten',
  },
  {
    type: 'video',
    value: `${awsS3}/Kyoto_Rain.mp4`,
    label: 'Kyoto Rain',
  },
  {
    type: 'video',
    value: `${awsS3}/Landscape_Waves.mp4`,
    label: 'Landscape Waves',
  },
  {
    type: 'video',
    value: `${awsS3}/Magic_Portal.mp4`,
    label: 'Magic Portal',
  },
  {
    type: 'video',
    value: `${awsS3}/Midnight_Grove.mov`,
    label: 'Midnight Grove',
  },
  {
    type: 'video',
    value: `${awsS3}/Moonlight_Campfire.mp4`,
    label: 'Moonlight Campfire',
  },
  {
    type: 'video',
    value: `${awsS3}/Mushrooms.mov`,
    label: 'Mushrooms',
  },
  {
    type: 'video',
    value: `${awsS3}/Nebula.mp4`,
    label: 'Nebula',
  },
  {
    type: 'video',
    value: `${awsS3}/Neo.mp4`,
    label: 'Neo',
  },
  {
    type: 'video',
    value: `${awsS3}/Neon_Slide.mp4`,
    label: 'Neon Slide',
  },
  {
    type: 'video',
    value: `${awsS3}/Neon_Stars.mp4`,
    label: 'Neon Stars',
  },
  {
    type: 'video',
    value: `${awsS3}/Neon_Tunnel.mov`,
    label: 'Neon Tunnel',
  },
  {
    type: 'video',
    value: `${awsS3}/Network.mp4`,
    label: 'Network',
  },
  {
    type: 'video',
    value: `${awsS3}/Night_City.mp4`,
    label: 'Night City',
  },
  {
    type: 'video',
    value: `${awsS3}/Peaceful_River.mp4`,
    label: 'Peaceful River',
  },
  {
    type: 'video',
    value: `${awsS3}/Plasma.mp4`,
    label: 'Plasma',
  },
  {
    type: 'video',
    value: `${awsS3}/Plexus.mp4`,
    label: 'Plexus',
  },
  {
    type: 'video',
    value: `${awsS3}/Poolside.mp4`,
    label: 'Poolside',
  },
  {
    type: 'video',
    value: `${awsS3}/Redshift.mp4`,
    label: 'Redshift',
  },
  {
    type: 'video',
    value: `${awsS3}/Rings.mov`,
    label: 'Rings',
  },
  {
    type: 'video',
    value: `${awsS3}/Sakura.mp4`,
    label: 'Sakura',
  },
  {
    type: 'video',
    value: `${awsS3}/Savannah_Sunset.mp4`,
    label: 'Savannah Sunset',
  },
  {
    type: 'video',
    value: `${awsS3}/Sleigh_Ride.mov`,
    label: 'Sleigh Ride',
  },
  {
    type: 'video',
    value: `${awsS3}/Snow_Globe.mp4`,
    label: 'Snow Globe',
  },
  {
    type: 'video',
    value: `${awsS3}/Snowflakes.mp4`,
    label: 'Snowflakes',
  },
  {
    type: 'video',
    value: `${awsS3}/Space_Grid.mp4`,
    label: 'Space Grid',
  },
  {
    type: 'video',
    value: `${awsS3}/Sparkle.mp4`,
    label: 'Sparkle',
  },
  {
    type: 'video',
    value: `${awsS3}/Spotlight.mp4`,
    label: 'Spotlight',
  },
  {
    type: 'video',
    value: `${awsS3}/Stormy_Sky.mov`,
    label: 'Stormy Sky',
  },
  {
    type: 'video',
    value: `${awsS3}/Sunset_Beach.mp4`,
    label: 'Sunset Beach',
  },
  {
    type: 'video',
    value: `${awsS3}/Tokyo_Spring.mp4`,
    label: 'tokyo Spring',
  },
  {
    type: 'video',
    value: `${awsS3}/Torus.mp4`,
    label: 'Torus',
  },
  {
    type: 'video',
    value: `${awsS3}/Turbulence.mp4`,
    label: 'Turbulence',
  },
  {
    type: 'video',
    value: `${awsS3}/Urban_Sunset.mov`,
    label: 'Urban Sunset',
  },
  {
    type: 'video',
    value: `${awsS3}/Winter_Wonderland.mp4`,
    label: 'Winter Wonderland',
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