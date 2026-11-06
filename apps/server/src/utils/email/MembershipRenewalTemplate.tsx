import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";

// Membership renewal reminder (MB-1, amendment 1: readiness 3 days before a charge and the
// 7 day grace). Names the seller and links the store policy version (amendment 3.9). No earn,
// yield or invest wording; "every 30 days", never "monthly".

interface MembershipRenewalTemplateProps {
  heading?: string;
  body?: string;
  soldBy?: string;
  addUsdcLabel?: string;
  addUsdcUrl?: string;
  policyLabel?: string;
  policyUrl?: string | null;
  manage?: string;
}

export const MembershipRenewalTemplate = ({
  heading = "Your membership renews soon",
  body = "",
  soldBy = "",
  addUsdcLabel = "Add USDC",
  addUsdcUrl = "#",
  policyLabel = "Store policy",
  policyUrl = null,
  manage = "",
}: MembershipRenewalTemplateProps) => (
  <Html>
    <Head />
    <Preview>{heading}</Preview>
    <Tailwind>
      <Body className="bg-[#f4f3fa] font-sans">
        <Container className="mx-auto my-[34px] max-w-[480px] rounded-[21px] bg-white p-[34px]">
          <Heading className="m-0 text-[22px] font-bold text-[#16152b]">{heading}</Heading>
          <Text className="text-[16px] leading-[24px] text-[#16152b]">{body}</Text>
          <Section className="my-[21px]">
            <Button
              href={addUsdcUrl}
              className="rounded-[13px] bg-[#16152b] px-[21px] py-[13px] text-[16px] font-bold text-white"
            >
              {addUsdcLabel}
            </Button>
          </Section>
          <Text className="text-[14px] text-[#3a3858]">
            {soldBy}{" "}
            {policyUrl ? (
              <Link href={policyUrl} className="text-[#5650a2] underline">
                {policyLabel}
              </Link>
            ) : null}
          </Text>
          <Text className="text-[14px] text-[#3a3858]">{manage}</Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default MembershipRenewalTemplate;
