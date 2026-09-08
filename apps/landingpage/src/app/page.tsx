import { PublicHeader } from "@/components/layout/PublicHeader";
import { ProfileView } from "@/components/ProfileView";
import { fetchProfilePageData } from "@/lib/getProfileData";
import { DEFAULT_HANDLE, DEFAULT_PROFILE_DATA } from "@/lib/profilePageData";

// Cache the homepage for 5 minutes; revalidate on demand after that
export const revalidate = 300;

export default async function HomePage() {
  let initialData = await fetchProfilePageData(DEFAULT_HANDLE);

  if (!initialData) {
    initialData = DEFAULT_PROFILE_DATA;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow">
        <ProfileView initialData={initialData} />
      </main>
    </div>
  );
}
