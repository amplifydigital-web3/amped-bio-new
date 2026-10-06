import { useRef } from "react";
import { useEditor } from "@/contexts/EditorContext";
import { FindRnsName } from "./FindRnsName";
import { MyRnsNames } from "./MyRnsNames";
import { AboutRns } from "./AboutRns";
import { AddressView } from "./AddressView";
import { RegisterFlow } from "./RegisterFlow";
import { useRnsRoute } from "./useRnsRoute";
import { NamePage } from "./name/NamePage";

/**
 * Screen Review 102 and 111: the RNS name page and the address view, full
 * Wallet views with a back lens to the RNS tab.
 */
export function RnsSubPage() {
  const route = useRnsRoute();
  if (route.address) {
    return (
      <AddressView
        address={route.address}
        onBack={() => route.go({})}
        onOpenName={label => route.go({ name: label })}
      />
    );
  }
  if (!route.name) return null;
  return <NamePage key={route.name} label={route.name} />;
}

/**
 * Screen Review 101: the Wallet RNS tab. Find an RNS name and My RNS names on
 * the left, About Revolution Name Service on the right; one column at 390.
 * Register opens the 078 value panel at &flow=register&name=<label>.
 */
export function RnsTab() {
  const route = useRnsRoute();
  const { setActivePanelAndNavigate } = useEditor();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-[34px] font-prism lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-[21px]">
      <div className="min-w-0 space-y-[34px]">
        <FindRnsName
          inputRef={searchRef}
          onRegister={label => route.go({ flow: "register", name: label })}
          onOpenName={label => route.go({ name: label })}
          onOpenAddress={address => route.go({ address })}
        />
        <MyRnsNames
          onOpenName={label => route.go({ name: label })}
          onSearch={() => searchRef.current?.focus()}
        />
      </div>
      <div className="min-w-0 lg:pt-[1px]">
        <AboutRns />
      </div>
      {route.flow === "register" && route.name && (
        <RegisterFlow
          key={route.name}
          label={route.name}
          onClose={route.closeFlow}
          onOpenName={(label, view) => route.go({ name: label, view })}
          onRegisterAnother={() => {
            route.closeFlow();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
          onShowOnPage={() => setActivePanelAndNavigate("page")}
        />
      )}
    </div>
  );
}
