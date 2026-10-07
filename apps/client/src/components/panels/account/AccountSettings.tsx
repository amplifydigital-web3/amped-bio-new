import { useSearchParams } from "react-router";
import { DisclosureGroup } from "../design/kit/DisclosureRow";
import { CONNECTED_APPS_ROW, ConnectedAppsRow } from "./ConnectedAppsRow";
import { EMAIL_ROW, EmailRow } from "./EmailRow";
import { PAGE_VISIBILITY_ROW, PageVisibilityRow } from "./PageVisibilityRow";
import { PASSWORD_ROW, PasswordRow } from "./PasswordRow";
import { PUBLIC_URL_ROW, PublicUrlRow } from "./PublicUrlRow";
import { TWO_FACTOR_ROW, TwoFactorRow } from "./TwoFactorRow";

// Screen Review 019 I01, 021 I01 and 098 I01 (D04, D30). Account Settings is
// one 610 column with one G1 clear card of flat disclosure rows: Public URL,
// Email, Password, Two factor, Connected apps. One row is open at a time;
// ?open=<row> opens one. With the Fan Graph on, Page visibility (QA-008)
// follows Public URL.

const ROWS = [
  PUBLIC_URL_ROW,
  PAGE_VISIBILITY_ROW,
  EMAIL_ROW,
  PASSWORD_ROW,
  TWO_FACTOR_ROW,
  CONNECTED_APPS_ROW,
];

export function AccountSettings() {
  const [params] = useSearchParams();
  const requested = params.get("open");
  const initialOpen = requested && ROWS.includes(requested) ? requested : undefined;

  return (
    <div className="max-w-[610px]">
      <div className="prism-glass-clear [&>div>div:last-child]:border-b-0">
        <DisclosureGroup
          storageKey="amped:account-open"
          defaultOpen={null}
          initialOpen={initialOpen}
          inset
        >
          <PublicUrlRow />
          <PageVisibilityRow />
          <EmailRow />
          <PasswordRow />
          <TwoFactorRow />
          <ConnectedAppsRow />
        </DisclosureGroup>
      </div>
    </div>
  );
}
