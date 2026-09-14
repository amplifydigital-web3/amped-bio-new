import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ProfileView } from "@/components/ProfileView";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageData } from "@/lib/getProfileData";
import { DEFAULT_HANDLE, DEFAULT_PROFILE_DATA } from "@/lib/profilePageData";

// Render each profile page on the server for every request
export const dynamic = "force-dynamic";

export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const normalizedHandle = normalizeHandle(handle);

  let initialData = await fetchProfilePageData(normalizedHandle);

  if (!initialData) {
    if (normalizedHandle === DEFAULT_HANDLE) {
      initialData = DEFAULT_PROFILE_DATA;
    } else {
      redirect("/");
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {normalizedHandle === DEFAULT_HANDLE && <PublicHeader />}
      <main className="flex-grow">
        <ProfileView handle={handle} initialData={initialData} />
      </main>
    </div>
  );
}
