interface ProfileNavProps {
  name: string;
  activeTab?: "details" | "ownership" | "more";
  onTabChange: (tab: "details" | "ownership" | "more") => void;
}

export const ProfileNav = ({ activeTab = "details", onTabChange }: ProfileNavProps) => {
  const navItems = [
    {
      label: "Profile",
      tab: "details" as const,
    },
    {
      label: "Ownership",
      tab: "ownership" as const,
    },
    {
      label: "More",
      tab: "more" as const,
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
