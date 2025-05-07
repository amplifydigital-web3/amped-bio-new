import type { Background } from "../types/editor";

// Base S3 URL
const s3BaseUrl = "https://amped-bio.s3.amazonaws.com/themes";

const awsS3 =
  import.meta.env?.AWS_S3_BACKGROUNDS ||
  `${s3BaseUrl}/backgrounds`;

const thumbnailsPath = awsS3;

const photosPath = import.meta.env?.AWS_S3_PHOTOS || 
  `${s3BaseUrl}/photos`;

// Path for photo thumbnails
const photoThumbnailsPath = `${s3BaseUrl}/photos`;

export const gradients: Background[] = [
  {
    id: "image-aurora-gradient",
    type: "image",
    value: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809",
    label: "Aurora Gradient",
  },
  {
    id: "image-sunset-gradient",
    type: "image",
    value: "https://images.unsplash.com/photo-1557682224-5b8590cd9ec5",
    label: "Sunset Gradient",
  },
  {
    id: "image-ocean-gradient",
    type: "image",
    value: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d",
    label: "Ocean Gradient",
  },
  {
    id: "image-neon-gradient",
    type: "image",
    value: "https://images.unsplash.com/photo-1579546929662-711aa81148cf",
    label: "Neon Gradient",
  },
];

export const photos: Background[] = [
  // Nature & Landscapes
  {
    id: 'photo_mountain_sunset',
    type: 'image',
    value: `${photosPath}/photo-1505765050516-f72dcac9c60e.jpg`,
    label: 'Mountain Sunset',
    thumbnail: `${photoThumbnailsPath}/photo-1505765050516-f72dcac9c60e_thumbnail.jpg`,
  },
  {
    id: 'photo_starry_night',
    type: 'image',
    value: `${photosPath}/photo-1470770903676-69b98201ea1c.jpg`,
    label: 'Starry Night',
    thumbnail: `${photoThumbnailsPath}/photo-1470770903676-69b98201ea1c_thumbnail.jpg`,
  },
  {
    id: 'photo_forest_path',
    type: 'image',
    value: `${photosPath}/photo-1465146344425-f00d5f5c8f07.jpg`,
    label: 'Forest Path',
    thumbnail: `${photoThumbnailsPath}/photo-1465146344425-f00d5f5c8f07_thumbnail.jpg`,
  },
  {
    id: 'photo_northern_lights',
    type: 'image',
    value: `${photosPath}/photo-1483728642387-6c3bdd6c93e5.jpg`,
    label: 'Northern Lights',
    thumbnail: `${photoThumbnailsPath}/photo-1483728642387-6c3bdd6c93e5_thumbnail.jpg`,
  },
  // Abstract & Patterns
  {
    id: 'photo_abstract_waves',
    type: 'image',
    value: `${photosPath}/photo-1550859492-d5da9d8e45f3.jpg`,
    label: 'Abstract Waves',
    thumbnail: `${photoThumbnailsPath}/photo-1550859492-d5da9d8e45f3_thumbnail.jpg`,
  },
  {
    id: 'photo_liquid_art',
    type: 'image',
    value: `${photosPath}/photo-1553356084-58ef4a67b2a7.jpg`,
    label: 'Liquid Art',
    thumbnail: `${photoThumbnailsPath}/photo-1553356084-58ef4a67b2a7_thumbnail.jpg`,
  },
  {
    id: 'photo_color_flow',
    type: 'image',
    value: `${photosPath}/photo-1579546929518-9e396f3cc809.jpg`,
    label: 'Color Flow',
    thumbnail: `${photoThumbnailsPath}/photo-1579546929518-9e396f3cc809_thumbnail.jpg`,
  },
  // Urban & Architecture
  {
    id: 'photo_city_lights',
    type: 'image',
    value: `${photosPath}/photo-1449824913935-59a10b8d2000.jpg`,
    label: 'City Lights',
    thumbnail: `${photoThumbnailsPath}/photo-1449824913935-59a10b8d2000_thumbnail.jpg`,
  },
  {
    id: 'photo_night_city',
    type: 'image',
    value: `${photosPath}/photo-1444723121867-7a241cacace9.jpg`,
    label: 'Night City',
    thumbnail: `${photoThumbnailsPath}/photo-1444723121867-7a241cacace9_thumbnail.jpg`,
  },
  // Minimal & Clean
  {
    id: 'photo_minimal_white',
    type: 'image',
    value: `${photosPath}/photo-1507908708918-778587c9e563.jpg`,
    label: 'Minimal White',
    thumbnail: `${photoThumbnailsPath}/photo-1507908708918-778587c9e563_thumbnail.jpg`,
  },
  {
    id: 'photo_clean_lines',
    type: 'image',
    value: `${photosPath}/photo-1557683311-eac922347aa1.jpg`,
    label: 'Clean Lines',
    thumbnail: `${photoThumbnailsPath}/photo-1557683311-eac922347aa1_thumbnail.jpg`,
  },
  // Technology
  {
    id: 'photo_tech_grid',
    type: 'image',
    value: `${photosPath}/photo-1518770660439-4636190af475.jpg`,
    label: 'Tech Grid',
    thumbnail: `${photoThumbnailsPath}/photo-1518770660439-4636190af475_thumbnail.jpg`,
  },
  {
    id: 'photo_digital_rain',
    type: 'image',
    value: `${photosPath}/photo-1526374965328-7f61d4dc18c5.jpg`,
    label: 'Digital Rain',
    thumbnail: `${photoThumbnailsPath}/photo-1526374965328-7f61d4dc18c5_thumbnail.jpg`,
  },
  // Space & Cosmos
  {
    id: 'photo_galaxy',
    type: 'image',
    value: `${photosPath}/photo-1462332420958-a05d1e002413.jpg`,
    label: 'Galaxy',
    thumbnail: `${photoThumbnailsPath}/photo-1462332420958-a05d1e002413_thumbnail.jpg`,
  },
  {
    id: 'photo_nebula',
    type: 'image',
    value: `${photosPath}/photo-1419242902214-272b3f66ee7a.jpg`,
    label: 'Nebula',
    thumbnail: `${photoThumbnailsPath}/photo-1419242902214-272b3f66ee7a_thumbnail.jpg`,
  },
  // Artistic
  {
    id: 'photo_paint_splash',
    type: 'image',
    value: `${photosPath}/photo-1543857778-c4a1a3e0b2eb.jpg`,
    label: 'Paint Splash',
    thumbnail: `${photoThumbnailsPath}/photo-1543857778-c4a1a3e0b2eb_thumbnail.jpg`,
  },
  // Web3 & Crypto
  {
    id: 'photo_blockchain',
    type: 'image',
    value: `${photosPath}/photo-1639762681485-074b7f938ba0.jpg`,
    label: 'Blockchain',
    thumbnail: `${photoThumbnailsPath}/photo-1639762681485-074b7f938ba0_thumbnail.jpg`,
  },
  {
    id: 'photo_crypto_art',
    type: 'image',
    value: `${photosPath}/photo-1644143379190-08a5f055de1d.jpg`,
    label: 'Crypto Art',
    thumbnail: `${photoThumbnailsPath}/photo-1644143379190-08a5f055de1d_thumbnail.jpg`,
  },
  // Futuristic
  {
    id: 'photo_future_city',
    type: 'image',
    value: `${photosPath}/photo-1451187580459-43490279c0fa.jpg`,
    label: 'Future City',
    thumbnail: `${photoThumbnailsPath}/photo-1451187580459-43490279c0fa_thumbnail.jpg`,
  },
  {
    id: 'photo_neon_future',
    type: 'image',
    value: `${photosPath}/photo-1534972195531-d756b9bfa9f2.jpg`,
    label: 'Neon Future',
    thumbnail: `${photoThumbnailsPath}/photo-1534972195531-d756b9bfa9f2_thumbnail.jpg`,
  },
];

export const videos = [
  {
    id: "video-ink-flow",
    type: "video",
    value:
      "https://assets.mixkit.co/active_storage/video_items/99921/1717719102/99921-video-720.mp4",
    label: "Ink Flow",
    thumbnail: `${thumbnailsPath}/99921-video-720_thumbnail.jpg`,
  },
  {
    id: "video-cloudy-sky",
    type: "video",
    value: "https://assets.mixkit.co/videos/24551/24551-720.mp4",
    label: "Cloudy Sky",
    thumbnail: `${thumbnailsPath}/24551-720_thumbnail.jpg`,
  },
  {
    id: "video-gradient-lines",
    type: "video",
    value: "https://assets.mixkit.co/videos/35746/35746-720.mp4",
    label: "Gradient Lines",
    thumbnail: `${thumbnailsPath}/35746-720_thumbnail.jpg`,
  },
  {
    id: "video-digital-wall",
    type: "video",
    value: "https://assets.mixkit.co/videos/4192/4192-720.mp4",
    label: "Digital Wall",
    thumbnail: `${thumbnailsPath}/4192-720_thumbnail.jpg`,
  },
  {
    id: "video-ocean-waves",
    type: "video",
    value: "https://assets.mixkit.co/videos/51476/51476-720.mp4",
    label: "Ocean Waves",
    thumbnail: `${thumbnailsPath}/51476-720_thumbnail.jpg`,
  },
  {
    id: "video-make-it-rain",
    type: "video",
    value: "https://assets.mixkit.co/videos/18305/18305-720.mp4",
    label: "Make it Rain",
    thumbnail: `${thumbnailsPath}/18305-720_thumbnail.jpg`,
  },
  {
    id: "video-city-traffic",
    type: "video",
    value: "https://assets.mixkit.co/videos/4067/4067-720.mp4",
    label: "City Traffic",
    thumbnail: `${thumbnailsPath}/4067-720_thumbnail.jpg`,
  },
  {
    id: "astral_staircase",
    type: "video",
    value: `${awsS3}/Astral_Staircase.mp4`,
    label: "Astral Staircase",
    thumbnail: `${thumbnailsPath}/Astral_Staircase_thumbnail.jpg`,
  },
  {
    id: "beach_house",
    type: "video",
    value: `${awsS3}/Beach_House.mp4`,
    label: "Beach House",
    thumbnail: `${thumbnailsPath}/Beach_House_thumbnail.jpg`,
  },
  {
    id: "big_sky",
    type: "video",
    value: `${awsS3}/Big_Sky.mp4`,
    label: "Big Sky",
    thumbnail: `${thumbnailsPath}/Big_Sky_thumbnail.jpg`,
  },
  {
    id: "bubbles",
    type: "video",
    value: `${awsS3}/Bubbles.mp4`,
    label: "Bubbles",
    thumbnail: `${thumbnailsPath}/Bubbles_thumbnail.jpg`,
  },
  {
    id: "christmas_ornaments",
    type: "video",
    value: `${awsS3}/Christmas_Ornaments.mp4`,
    label: "Cristmas Ornaments",
    thumbnail: `${thumbnailsPath}/Christmas_Ornaments_thumbnail.jpg`,
  },
  {
    id: "cube_wall",
    type: "video",
    value: `${awsS3}/Cube_Wall.mp4`,
    label: "Cube Wall",
    thumbnail: `${thumbnailsPath}/Cube_Wall_thumbnail.jpg`,
  },
  {
    id: "cyber_arches",
    type: "video",
    value: `${awsS3}/Cyber_Arches.mp4`,
    label: "Cyber Arches",
    thumbnail: `${thumbnailsPath}/Cyber_Arches_thumbnail.jpg`,
  },
  {
    id: "cyber_corridor",
    type: "video",
    value: `${awsS3}/Cyber_Corridor.mp4`,
    label: "Cyber Corridor",
    thumbnail: `${thumbnailsPath}/Cyber_Corridor_thumbnail.jpg`,
  },
  {
    id: "dark_lightning",
    type: "video",
    value: `${awsS3}/Dark_Lightning.mp4`,
    label: "Dark Lightning",
    thumbnail: `${thumbnailsPath}/Dark_Lightning_thumbnail.jpg`,
  },
  {
    id: "dot_matrix",
    type: "video",
    value: `${awsS3}/Dot_Matrix.mp4`,
    label: "Dot Matrix",
    thumbnail: `${thumbnailsPath}/Dot_Matrix_thumbnail.jpg`,
  },
  {
    id: "ellipse",
    type: "video",
    value: `${awsS3}/Ellipse.mp4`,
    label: "Ellipse",
    thumbnail: `${thumbnailsPath}/Ellipse_thumbnail.jpg`,
  },
  {
    id: "event_horizon",
    type: "video",
    value: `${awsS3}/Event_Horizon.mp4`,
    label: "Event Horizon",
    thumbnail: `${thumbnailsPath}/Event_Horizon_thumbnail.jpg`,
  },
  {
    id: "forest_sunbeams",
    type: "video",
    value: `${awsS3}/Forest_Sunbeams.mp4`,
    label: "Forest Sunbeams",
    thumbnail: `${thumbnailsPath}/Forest_Sunbeams_thumbnail.jpg`,
  },
  {
    id: "fractal_flower",
    type: "video",
    value: `${awsS3}/Fractal_Flower.mp4`,
    label: "Fractal Flower",
    thumbnail: `${thumbnailsPath}/Fractal_Flower_thumbnail.jpg`,
  },
  {
    id: "inferno",
    type: "video",
    value: `${awsS3}/Inferno.mp4`,
    label: "Inferno",
    thumbnail: `${thumbnailsPath}/Inferno_thumbnail.jpg`,
  },
  {
    id: "jade_tunnel",
    type: "video",
    value: `${awsS3}/Jade_Tunnel.mp4`,
    label: "Jade Tunnel",
    thumbnail: `${thumbnailsPath}/Jade_Tunnel_thumbnail.jpg`,
  },
  {
    id: "kitten",
    type: "video",
    value: `${awsS3}/Kitten.mp4`,
    label: "Kitten",
    thumbnail: `${thumbnailsPath}/Kitten_thumbnail.jpg`,
  },
  {
    id: "kyoto_rain",
    type: "video",
    value: `${awsS3}/Kyoto_Rain.mp4`,
    label: "Kyoto Rain",
    thumbnail: `${thumbnailsPath}/Kyoto_Rain_thumbnail.jpg`,
  },
  {
    id: "landscape_waves",
    type: "video",
    value: `${awsS3}/Landscape_Waves.mp4`,
    label: "Landscape Waves",
    thumbnail: `${thumbnailsPath}/Landscape_Waves_thumbnail.jpg`,
  },
  {
    id: "magic_portal",
    type: "video",
    value: `${awsS3}/Magic_Portal.mp4`,
    label: "Magic Portal",
    thumbnail: `${thumbnailsPath}/Magic_Portal_thumbnail.jpg`,
  },
  {
    id: "midnight_grove",
    type: "video",
    value: `${awsS3}/Midnight_Grove.mp4`,
    label: "Midnight Grove",
    thumbnail: `${thumbnailsPath}/Midnight_Grove_thumbnail.jpg`,
  },
  {
    id: "moonlight_campfire",
    type: "video",
    value: `${awsS3}/Moonlight_Campfire.mp4`,
    label: "Moonlight Campfire",
    thumbnail: `${thumbnailsPath}/Moonlight_Campfire_thumbnail.jpg`,
  },
  {
    id: "mushrooms",
    type: "video",
    value: `${awsS3}/Mushrooms.mp4`,
    label: "Mushrooms",
    thumbnail: `${thumbnailsPath}/Mushrooms_thumbnail.jpg`,
  },
  {
    id: "nebula",
    type: "video",
    value: `${awsS3}/Nebula.mp4`,
    label: "Nebula",
    thumbnail: `${thumbnailsPath}/Nebula_thumbnail.jpg`,
  },
  {
    id: "neo",
    type: "video",
    value: `${awsS3}/Neo.mp4`,
    label: "Neo",
    thumbnail: `${thumbnailsPath}/Neo_thumbnail.jpg`,
  },
  {
    id: "neon_slide",
    type: "video",
    value: `${awsS3}/Neon_Slide.mp4`,
    label: "Neon Slide",
    thumbnail: `${thumbnailsPath}/Neon_Slide_thumbnail.jpg`,
  },
  {
    id: "neon_stars",
    type: "video",
    value: `${awsS3}/Neon_Stars.mp4`,
    label: "Neon Stars",
    thumbnail: `${thumbnailsPath}/Neon_Stars_thumbnail.jpg`,
  },
  {
    id: "neon_tunnel",
    type: "video",
    value: `${awsS3}/Neon_Tunnel.mp4`,
    label: "Neon Tunnel",
    thumbnail: `${thumbnailsPath}/Neon_Tunnel_thumbnail.jpg`,
  },
  {
    id: "network",
    type: "video",
    value: `${awsS3}/Network.mp4`,
    label: "Network",
    thumbnail: `${thumbnailsPath}/Network_thumbnail.jpg`,
  },
  {
    id: "night_city",
    type: "video",
    value: `${awsS3}/Night_City.mp4`,
    label: "Night City",
    thumbnail: `${thumbnailsPath}/Night_City_thumbnail.jpg`,
  },
  {
    id: "peaceful_river",
    type: "video",
    value: `${awsS3}/Peaceful_River.mp4`,
    label: "Peaceful River",
    thumbnail: `${thumbnailsPath}/Peaceful_River_thumbnail.jpg`,
  },
  {
    id: "plasma",
    type: "video",
    value: `${awsS3}/Plasma.mp4`,
    label: "Plasma",
    thumbnail: `${thumbnailsPath}/Plasma_thumbnail.jpg`,
  },
  {
    id: "plexus",
    type: "video",
    value: `${awsS3}/Plexus.mp4`,
    label: "Plexus",
    thumbnail: `${thumbnailsPath}/Plexus_thumbnail.jpg`,
  },
  {
    id: "poolside",
    type: "video",
    value: `${awsS3}/Poolside.mp4`,
    label: "Poolside",
    thumbnail: `${thumbnailsPath}/Poolside_thumbnail.jpg`,
  },
  {
    id: "redshift",
    type: "video",
    value: `${awsS3}/Redshift.mp4`,
    label: "Redshift",
    thumbnail: `${thumbnailsPath}/Redshift_thumbnail.jpg`,
  },
  {
    id: "rings",
    type: "video",
    value: `${awsS3}/Rings.mp4`,
    label: "Rings",
    thumbnail: `${thumbnailsPath}/Rings_thumbnail.jpg`,
  },
  {
    id: "sakura",
    type: "video",
    value: `${awsS3}/Sakura.mp4`,
    label: "Sakura",
    thumbnail: `${thumbnailsPath}/Sakura_thumbnail.jpg`,
  },
  {
    id: "savannah_sunset",
    type: "video",
    value: `${awsS3}/Savannah_Sunset.mp4`,
    label: "Savannah Sunset",
    thumbnail: `${thumbnailsPath}/Savannah_Sunset_thumbnail.jpg`,
  },
  {
    id: "sleigh_ride",
    type: "video",
    value: `${awsS3}/Sleigh_Ride.mp4`,
    label: "Sleigh Ride",
    thumbnail: `${thumbnailsPath}/Sleigh_Ride_thumbnail.jpg`,
  },
  {
    id: "snow_globe",
    type: "video",
    value: `${awsS3}/Snow_Globe.mp4`,
    label: "Snow Globe",
    thumbnail: `${thumbnailsPath}/Snow_Globe_thumbnail.jpg`,
  },
  {
    id: "snowflakes",
    type: "video",
    value: `${awsS3}/Snowflakes.mp4`,
    label: "Snowflakes",
    thumbnail: `${thumbnailsPath}/Snowflakes_thumbnail.jpg`,
  },
  {
    id: "space_grid",
    type: "video",
    value: `${awsS3}/Space_Grid.mp4`,
    label: "Space Grid",
    thumbnail: `${thumbnailsPath}/Space_Grid_thumbnail.jpg`,
  },
  {
    id: "sparkle",
    type: "video",
    value: `${awsS3}/Sparkle.mp4`,
    label: "Sparkle",
    thumbnail: `${thumbnailsPath}/Sparkle_thumbnail.jpg`,
  },
  {
    id: "spotlight",
    type: "video",
    value: `${awsS3}/Spotlight.mp4`,
    label: "Spotlight",
    thumbnail: `${thumbnailsPath}/Spotlight_thumbnail.jpg`,
  },
  {
    id: "stormy_sky",
    type: "video",
    value: `${awsS3}/Stormy_Sky.mp4`,
    label: "Stormy Sky",
    thumbnail: `${thumbnailsPath}/Stormy_Sky_thumbnail.jpg`,
  },
  {
    id: "sunset_beach",
    type: "video",
    value: `${awsS3}/Sunset_Beach.mp4`,
    label: "Sunset Beach",
    thumbnail: `${thumbnailsPath}/Sunset_Beach_thumbnail.jpg`,
  },
  {
    id: "tokyo_spring",
    type: "video",
    value: `${awsS3}/Tokyo_Spring.mp4`,
    label: "Tokyo Spring",
    thumbnail: `${thumbnailsPath}/Tokyo_Spring_thumbnail.jpg`,
  },
  {
    id: "torus",
    type: "video",
    value: `${awsS3}/Torus.mp4`,
    label: "Torus",
    thumbnail: `${thumbnailsPath}/Torus_thumbnail.jpg`,
  },
  {
    id: "turbulence",
    type: "video",
    value: `${awsS3}/Turbulence.mp4`,
    label: "Turbulence",
    thumbnail: `${thumbnailsPath}/Turbulence_thumbnail.jpg`,
  },
  {
    id: "urban_sunset",
    type: "video",
    value: `${awsS3}/Urban_Sunset.mp4`,
    label: "Urban Sunset",
    thumbnail: `${thumbnailsPath}/Urban_Sunset_thumbnail.jpg`,
  },
  {
    id: "winter_wonderland",
    type: "video",
    value: `${awsS3}/Winter_Wonderland.mp4`,
    label: "Winter Wonderland",
    thumbnail: `${thumbnailsPath}/Winter_Wonderland_thumbnail.jpg`,
  },
] as const satisfies Background[];

export const backgroundColors: Background[] = [
  {
    id: "color-blue-gradient",
    type: "color",
    value: "linear-gradient(to right, #00c6ff, #0072ff)",
    label: "Blue Gradient",
  },
  {
    id: "color-pink-purple",
    type: "color",
    value: "linear-gradient(to right, #fc466b, #3f5efb)",
    label: "Pink Purple",
  },
  {
    id: "color-green-flow",
    type: "color",
    value: "linear-gradient(to right, #11998e, #38ef7d)",
    label: "Green Flow",
  },
  {
    id: "color-warm-flame",
    type: "color",
    value: "linear-gradient(to right, #f12711, #f5af19)",
    label: "Warm Flame",
  },
] as const;

type VideoId = (typeof videos)[number]["id"];

/**
 * Gets a video background by its ID
 * @param id The unique identifier of the video
 * @returns The video background object
 */
export function getVideoById(id: VideoId): Background {
  return videos.find(video => video.id === id)!;
}
