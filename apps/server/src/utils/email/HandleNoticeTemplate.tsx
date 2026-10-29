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

// Reserved handles (Build Board D2, spec section 5 and 7.5). Two kinds:
// - notice: the account's handle is now reserved; it has until the deadline
//   to choose a new link, or it moves to the generated one.
// - assigned: an admin gave the account a reserved word.

interface HandleNoticeTemplateProps {
  kind?: "notice" | "assigned";
  handle?: string;
  /** notice: the link the account moves to on the deadline */
  fallbackHandle?: string;
  /** notice: the deadline, already formatted */
  deadline?: string;
  /** notice: the editor's Public URL row */
  chooseUrl?: string;
  /** assigned: the link the account had before */
  oldHandle?: string;
  /** assigned: whether the old link redirects for 90 days */
  redirects?: boolean;
  privacyUrl?: string;
}

const text = "text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left";

const HandleNoticeTemplate = ({
  kind = "notice",
  handle = "support",
  fallbackHandle = "support4821",
  deadline = "11 November 2026",
  chooseUrl = "https://app.amped.bio/account?tab=settings&open=url",
  oldHandle = "acmewear-shop",
  redirects = true,
  privacyUrl = "https://amped.bio/privacy",
}: HandleNoticeTemplateProps) => {
  const preview =
    kind === "notice"
      ? `Choose a new link for your page by ${deadline}`
      : `Your Amped.Bio link is now amped.bio/${handle}`;

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-[#edf2f7] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#3d4852] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[2px] border border-[#e8e5ef] p-[32px] shadow-sm">
              {kind === "notice" ? (
                <>
                  <Heading className="text-[18px] font-bold text-[#3d4852] m-0 text-left">
                    Choose a new link for your page
                  </Heading>
                  <Text className={text}>
                    Your page is at amped.bio/{handle}. That link is now reserved by Amped.Bio, so
                    it needs to change.
                  </Text>
                  <Text className={text}>
                    Choose a new link by <strong>{deadline}</strong>. If you do not, your page moves
                    on that day to a new link made from your current one, such as amped.bio/
                    {fallbackHandle}. Your page, followers and pool stay the same, and amped.bio/
                    {handle} sends visitors to the new link for 90 days.
                  </Text>
                  <Section className="text-left my-[24px]">
                    <Button
                      href={chooseUrl}
                      className="bg-[#2d3748] rounded-[4px] text-white text-[16px] px-[18px] py-[10px] no-underline"
                    >
                      Choose a new link
                    </Button>
                  </Section>
                  <Text className={text}>
                    Questions? Reply to this email or contact support from the editor.
                  </Text>
                </>
              ) : (
                <>
                  <Heading className="text-[18px] font-bold text-[#3d4852] m-0 text-left">
                    Your Amped.Bio link is now amped.bio/{handle}
                  </Heading>
                  <Text className={text}>
                    Amped.Bio gave your account the link amped.bio/{handle}.
                    {oldHandle ? ` Your page was at amped.bio/${oldHandle}.` : ""}
                  </Text>
                  {oldHandle && redirects ? (
                    <Text className={text}>
                      amped.bio/{oldHandle} sends visitors to your new link for 90 days.
                    </Text>
                  ) : null}
                  <Text className={text}>
                    This link is reserved for you. If you change it later from Public URL, you
                    cannot take it back yourself; contact support.
                  </Text>
                </>
              )}

              <Text className={text}>
                Regards,
                <br />
                Amped.Bio
              </Text>

              <Hr className="border-t border-[#e8e5ef] my-[25px]" />
            </Container>

            <Section className="text-center py-[32px]">
              <Text className="text-[12px] leading-[1.5em] text-[#b0adc5] m-0">
                © 2026 Oneiro N.A., Inc., dba Amplify Digital. All rights reserved.
              </Text>
              <Text className="text-[12px] leading-[1.5em] text-[#b0adc5] m-0">
                <Link href={privacyUrl} className="text-[#b0adc5] underline">
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

HandleNoticeTemplate.PreviewProps = {
  kind: "notice",
  handle: "support",
  fallbackHandle: "support4821",
  deadline: "11 November 2026",
};

export default HandleNoticeTemplate;
