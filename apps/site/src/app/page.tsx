import { PublicHeader } from "@/components/layout/PublicHeader";
import { ProfileView } from "@/components/ProfileView";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow">
        <ProfileView />
      </main>
    </div>
  );
}
