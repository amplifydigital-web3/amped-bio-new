import { Outlet } from "react-router";
import { AdminMobileDock, AdminRail } from "../shell/Rail";
import { AdminMobileTopBar, AdminTopBar } from "../shell/TopBar";
import { useAdminShortcuts } from "../shell/useAdminShortcuts";

// Screen Review 087 (D20): admin moves onto the editor's shell. The rail at
// x 21, the top bar and content from x 131 to the right edge minus 21 on
// desktop; the mobile top bar and the bottom dock below 768. Every admin
// route renders inside this one shell.
export function AdminLayout() {
  useAdminShortcuts();

  return (
    <div className="prism-room min-h-dvh font-prism text-prism-ink">
      <AdminRail />
      <AdminMobileTopBar />
      <div className="px-[13px] pb-[calc(114px+env(safe-area-inset-bottom,0px))] pt-[13px] md:pb-[34px] md:pl-[131px] md:pr-[21px] md:pt-[21px]">
        <AdminTopBar />
        <main className="min-w-0 pt-0 md:pt-[13px]">
          <Outlet />
        </main>
      </div>
      <AdminMobileDock />
    </div>
  );
}
