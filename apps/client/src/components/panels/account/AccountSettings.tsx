import { useSearchParams } from "react-router";
import { useAuth } from "@repo/ui";
import { SecurityTabContent } from "../profile/SecurityTabContent";
import { DisclosureGroup, DisclosureRow } from "../design/kit/DisclosureRow";
import { EMAIL_ROW, EmailRow } from "./EmailRow";
import { PUBLIC_URL_ROW, PublicUrlRow } from "./PublicUrlRow";

// Screen Review 019 I01 and 020 I01 (D04). Account Settings is one 610 column
// with one G1 clear card of flat disclosure rows: Public URL, Email, then Two
// factor. One row is open at a time; ?open=url or ?open=email opens one.
//
// The Password row (row three in 019 I01) comes with 021: there is no in
// account password change today, only the reset link from sign in. The Two
// factor row keeps today's content until 021 restyles it.

const TWO_FACTOR_ROW = "two-factor";
const ROWS = [PUBLIC_URL_ROW, EMAIL_ROW, TWO_FACTOR_ROW];

export function AccountSettings() {
  const [params] = useSearchParams();
  const { authUser } = useAuth();
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
          <EmailRow />
          <DisclosureRow
            id={TWO_FACTOR_ROW}
            label="Two factor"
            value={authUser?.twoFactorEnabled ? "On" : "Off"}
          >
            <SecurityTabContent />
          </DisclosureRow>
        </DisclosureGroup>
      </div>
    </div>
  );
}
