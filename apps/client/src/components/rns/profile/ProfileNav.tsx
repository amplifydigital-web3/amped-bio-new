import { Button } from "@/components/ui/Button";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";

interface ProfileNavProps {
  name: string;
  activeTab?: "details" | "ownership" | "more";
  connectedWallet?: string;
  addressFull?: string;
}

export const ProfileNav = ({
  name,
  activeTab = "details",
}: ProfileNavProps) => {
  const { navigateToProfile, navigateToProfileOwnership, navigateToProfileMore } =
    useRNSNavigation();

  const navItems = [
    {
      label: "Profile",
      tab: "details" as const,
      onClick: () => {
        console.log("Navigating to Profile tab for", name);
        navigateToProfile(name);
      },
    },
    {
      label: "Ownership",
      tab: "ownership" as const,
      onClick: () => {
        console.log("Navigating to Ownership tab for", name);
        navigateToProfileOwnership(name);
      },
    },
    {
      label: "More",
      tab: "more" as const,
      onClick: () => {
        console.log("Navigating to More tab for", name);
        navigateToProfileMore(name);
      },
    },
  ];

  return (
    <div className="mb-2 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-visible flex items-center justify-between">
      <nav className="flex min-w-max px-4 sm:px-0">
        {navItems.map(item => {
          const isActive = item.tab === activeTab;

          return (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`py-2 px-2 sm:px-2 text-lg font-bold whitespace-nowrap ${isActive ? "text-blue-500" : "text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300"}`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
