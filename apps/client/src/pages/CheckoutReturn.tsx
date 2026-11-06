import { useParams } from "react-router";
import { CHECKOUT_COPY, checkoutIntentIdSchema, checkoutPayPath } from "@repo/constants";
import { Button } from "@repo/ui";
import { SheetMessage } from "@/components/checkout/PaySheet";

/**
 * app.amped.bio/r/{intent} (docs/features/mobile-checkout.md 9, PR CK-3). Coinbase sends
 * the fan here after a Coinbase account purchase made from a checkout. The tab may hold no
 * Amped.Bio session, so the page reads nothing from the server and names no item, creator
 * or amount. The fan finishes in the tab that started the checkout, or through the link.
 */
export function CheckoutReturnPage() {
  const { intentId = "" } = useParams();
  const valid = checkoutIntentIdSchema.safeParse(intentId).success;
  return (
    <div className="prism-room flex min-h-dvh items-center justify-center px-[21px] py-[34px]">
      <main
        aria-label="Amped.Bio"
        className="flex w-full max-w-[420px] flex-col gap-[13px] rounded-prism-21 bg-white px-[21px] pb-[21px] font-prism text-[#16152B] shadow-[0_21px_55px_rgba(22,21,43,0.15)]"
      >
        <SheetMessage tone="done" title={CHECKOUT_COPY.onTheWay} />
        <Button asChild size="lg" className="w-full">
          <a href={valid ? checkoutPayPath(intentId) : "/"}>Open Amped.Bio</a>
        </Button>
      </main>
    </div>
  );
}
