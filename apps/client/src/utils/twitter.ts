export interface TwitterProfile {
  name: string;
  bio: string;
  profileImage: string;
}

export async function scrapeTwitterProfile(username: string): Promise<TwitterProfile> {
  try {
    const response = await fetch(`https://api.x.com/2/users/by/username/${username}`, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_TWITTER_BEARER_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();

    return {
      name: json.data.name,
      bio: json.data.description,
      profileImage: json.data.profile_image_url.replace("_normal", ""),
    };
  } catch (error) {
    throw new Error("Failed to fetch X profile");
  }
}
