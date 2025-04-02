import axios from 'axios';

export interface TwitterProfile {
  name: string;
  bio: string;
  profileImage: string;
}

export async function scrapeTwitterProfile(username: string): Promise<TwitterProfile> {
  try {
    // Note: In a production environment, this should be replaced with proper Twitter API integration
    const response = await axios.get(`https://api.x.com/2/users/by/username/${username}`, {
      headers: {
        // TODO fix this security flaw, dont expose bearer token in the frontend
        'Authorization': `Bearer ${import.meta.env.VITE_TWITTER_BEARER_TOKEN}`
      }
    });

    return {
      name: response.data.data.name,
      bio: response.data.data.description,
      profileImage: response.data.data.profile_image_url.replace('_normal', '')
    };
  } catch (error) {
    throw new Error('Failed to fetch X profile');
  }
}