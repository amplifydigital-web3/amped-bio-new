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

// RNS name expiry email. One template for the 30, 7 and 1 day reminders and
// the grace period notice. The button opens the extend flow on the name page.

interface RnsExpiryTemplateProps {
  name?: string;
  firstName?: string;
  grace?: boolean;
  daysLeft?: number;
  expiryDate?: string;
  releaseDate?: string;
  primary?: boolean;
  extendUrl?: string;
  settingsUrl?: string;
  privacyUrl?: string;
}

const RnsExpiryTemplate = ({
  name = "yourname.revotest.eth",
  firstName,
  grace = false,
  daysLeft = 7,
  expiryDate = "30 Oct 2026",
  releaseDate = "31 Oct 2026",
  primary = false,
  extendUrl = "https://app.amped.bio/wallet?tab=rns",
  settingsUrl = "https://app.amped.bio/account?open=reminders",
  privacyUrl = "https://amped.bio/privacy",
}: RnsExpiryTemplateProps) => {
  const days = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
  const heading = grace ? "Your RNS name has expired" : `Your RNS name expires in ${days}`;
  const preview = grace
    ? `Renew ${name} by ${releaseDate} or it is released.`
    : `Extend ${name} to keep your name, your page link and your verified badge.`;

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-[#f4f3fa] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#16152b] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[13px] border border-[#e8e5ef] p-[32px]">
              <Text className="m-0 inline-block rounded-[8px] bg-[#fbf1dc] px-[8px] py-[4px] text-[13px] font-bold text-[#7a4f00]">
                {grace ? `Grace period ends ${releaseDate}` : `Expires ${expiryDate}`}
              </Text>

              <Heading className="text-[24px] leading-[31px] font-bold text-[#16152b] mt-[21px] mb-0 text-left">
                {heading}
              </Heading>

              <Section className="mt-[21px] rounded-[13px] bg-[#efe7f8] p-[21px]">
                <Text className="m-0 text-[20px] font-bold text-[#16152b] break-all">{name}</Text>
                <Text className="m-0 mt-[8px] text-[15px] text-[#3a3858]">
                  {grace
                    ? `Expired ${expiryDate}`
                    : primary
                      ? "Your primary name."
                      : `Expires ${expiryDate}`}
                </Text>
              </Section>

              <Text className="text-[16px] leading-[26px] text-[#16152b] mt-[21px] text-left">
                {firstName ? `Hi ${firstName},` : "Hi,"}
              </Text>

              <Text className="text-[16px] leading-[26px] text-[#16152b] mt-0 text-left">
                {grace
                  ? `Your name no longer resolves. You can still renew it until ${releaseDate}. After that the name is released and anyone can register it.`
                  : `Your name expires on ${expiryDate}. Extend it to keep the name, the link on your page and your verified badge. After it expires you have 1 day to renew. Then the name is released and anyone can register it.`}
              </Text>

              <Section className="mt-[21px]">
                <Button
                  href={extendUrl}
                  className={`block rounded-[13px] px-[21px] py-[17px] text-center text-[16px] font-bold text-white ${grace ? "bg-[#5b2f70]" : "bg-[#5650a2]"}`}
                >
                  {grace ? `Renew ${name}` : `Extend ${name}`}
                </Button>
              </Section>

              <Text className="text-[13px] leading-[20px] text-[#3a3858] mt-[13px] text-left">
                You confirm in your wallet next. Nothing moves until you sign.
              </Text>

              <Hr className="border-t border-[#e8e5ef] my-[25px]" />

              <Text className="text-[13px] leading-[20px] text-[#3a3858] m-0 text-left">
                You get this because an RNS name in your Amped.Bio wallet is close to expiry.{" "}
                <Link href={settingsUrl} className="text-[#5650a2] underline">
                  Turn off name reminders
                </Link>
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
};

RnsExpiryTemplate.PreviewProps = {
  name: "yourname.revotest.eth",
  daysLeft: 7,
};

export default RnsExpiryTemplate;
