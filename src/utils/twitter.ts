import axios from 'axios';

export interface TwitterProfile {
  name: string;
  bio: string;
  profileImage: string;
}

export async function scrapeTwitterProfile(username: string): Promise<TwitterProfile> {
  try {
    // Note: In a production environment, this should be replaced with proper Twitter API integration
    const response = await axios.get(`https://api.twitter.com/2/users/by/username/${username}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_TWITTER_BEARER_TOKEN}`
      }
    });

    return {
      name: response.data.data.name,
      bio: response.data.data.description,
      profileImage: response.data.data.profile_image_url.replace('_normal', '')
    };
  } catch (error) {
    console.log('Failed to fetch Twitter profile');
    throw (error);
  }
}