import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";

// Purchase receipt (PAY-2; mobile checkout D4: receipts are sent at final confirmation).
// Content spec 3.12: a refund line on every receipt. No earn, yield or invest wording.

interface PurchaseReceiptTemplateProps {
  firstName?: string;
  itemTitle?: string;
  creatorHandle?: string;
  amount?: string;
  fee?: string;
  feePercent?: string;
  paidOn?: string;
  receiptId?: string;
  network?: string;
  txUrl?: string | null;
  openUrl?: string;
  refundWindowDays?: number;
  privacyUrl?: string;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <Section className="mt-[8px]">
    <Text className="m-0 inline-block w-[45%] text-[14px] text-[#3a3858]">{label}</Text>
    <Text className="m-0 inline-block w-[55%] text-right text-[14px] font-bold text-[#16152b]">
      {value}
    </Text>
  </Section>
);

const PurchaseReceiptTemplate = ({
  firstName,
  itemTitle = "Episode 4",
  creatorHandle = "maya",
  amount = "$3 USDC",
  fee = "$0.15 USDC",
  feePercent = "5%",
  paidOn = "3 Nov 2026",
  receiptId = "0f0f0f0f",
  network = "Base",
  txUrl = "https://basescan.org/tx/0x",
  openUrl = "https://amped.bio/maya/c/abc123",
  refundWindowDays = 30,
  privacyUrl = "https://amped.bio/privacy",
}: PurchaseReceiptTemplateProps) => (
  <Html>
    <Tailwind>
      <Head />
      <Preview>{`Your receipt for ${itemTitle} from @${creatorHandle}`}</Preview>
      <Body className="bg-[#f4f3fa] font-sans py-[40px]">
        <Container className="max-w-[570px] mx-auto">
          <Section className="text-center py-[25px]">
            <Text className="text-[#16152b] text-[19px] font-bold">Amped.Bio</Text>
          </Section>

          <Container className="bg-white rounded-[13px] border border-[#e8e5ef] p-[32px]">
            <Text className="m-0 inline-block rounded-[8px] bg-[#e6f4ea] px-[8px] py-[4px] text-[13px] font-bold text-[#1e6b34]">
              Paid {paidOn}
            </Text>

            <Heading className="text-[24px] leading-[31px] font-bold text-[#16152b] mt-[21px] mb-0 text-left">
              Your receipt
            </Heading>

            <Text className="text-[16px] leading-[26px] text-[#16152b] mt-[21px] text-left">
              {firstName ? `Hi ${firstName},` : "Hi,"}
            </Text>
            <Text className="text-[16px] leading-[26px] text-[#16152b] mt-0 text-left">
              {`You bought ${itemTitle} from @${creatorHandle}. Thank you for supporting their work.`}
            </Text>

            <Section className="mt-[13px] rounded-[13px] bg-[#efe7f8] p-[21px]">
              <Row label="Item" value={itemTitle} />
              <Row label="Paid to" value={`@${creatorHandle}`} />
              <Row label="Total" value={amount} />
              <Row label={`Includes the Amped.Bio fee of ${feePercent}`} value={fee} />
              <Row label="Network" value={`USDC on ${network}`} />
              <Row label="Receipt" value={receiptId} />
            </Section>

            <Section className="mt-[21px]">
              <Button
                href={openUrl}
                className="block rounded-[13px] bg-[#5650a2] px-[21px] py-[17px] text-center text-[16px] font-bold text-white"
              >
                Open {itemTitle}
              </Button>
            </Section>

            {txUrl ? (
              <Text className="text-[13px] leading-[20px] text-[#3a3858] mt-[13px] text-left">
                <Link href={txUrl} className="text-[#5650a2] underline">
                  View the payment on the block explorer
                </Link>
              </Text>
            ) : null}

            <Hr className="border-t border-[#e8e5ef] my-[25px]" />

            <Text className="text-[13px] leading-[20px] text-[#3a3858] m-0 text-left">
              {refundWindowDays > 0
                ? `Refunds: message @${creatorHandle} within ${refundWindowDays} ${refundWindowDays === 1 ? "day" : "days"} of purchase. A refund returns the full amount to your wallet.`
                : `Refunds: message @${creatorHandle}. A refund returns the full amount to your wallet.`}
            </Text>
          </Container>

          <Section className="text-center py-[32px]">
            <Text className="text-[12px] leading-[1.5em] text-[#524f73] m-0">
              © 2026 Oneiro N.A., Inc., dba Amplify Digital. All rights reserved.
            </Text>
            <Text className="text-[12px] leading-[1.5em] text-[#524f73] m-0">
              <Link href={privacyUrl} className="text-[#524f73] underline">
                Privacy Policy
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

PurchaseReceiptTemplate.PreviewProps = {
  itemTitle: "Episode 4",
  creatorHandle: "maya",
};

export default PurchaseReceiptTemplate;
