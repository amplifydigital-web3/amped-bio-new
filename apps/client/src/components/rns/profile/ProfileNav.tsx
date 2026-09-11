interface ProfileNavProps {
  name: string;
  activeTab?: "details" | "ownership" | "identity";
  onTabChange: (tab: "details" | "ownership" | "identity") => void;
  // Hidden when the Authbase integration isn't configured server-side.
  showIdentity?: boolean;
}

export const ProfileNav = ({
  activeTab = "details",
  onTabChange,
  showIdentity = true,
}: ProfileNavProps) => {
  const navItems = [
    {
      label: "Profile",
      tab: "details" as const,
    },
    {
      label: "Ownership",
      tab: "ownership" as const,
    },
    ...(showIdentity
      ? [
          {
            label: "Identity",
            tab: "identity" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="mb-2 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-visible flex items-center justify-between">
      <nav className="flex min-w-max px-4 sm:px-0">
        {navItems.map(item => {
          const isActive = item.tab === activeTab;

          return (
            <button
              key={item.label}
              onClick={() => onTabChange(item.tab)}
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
