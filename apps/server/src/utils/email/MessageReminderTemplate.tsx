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

// Amped Messages reminder (Build Board #2 r4, PR M4, spec 7.4 item 3). Sent when a
// message is still unread after 30 minutes. It never carries the message text: the
// reader opens the Inbox to see it. A request says so, since the sender is a stranger.

interface MessageReminderTemplateProps {
  handle?: string;
  name?: string;
  request?: boolean;
  count?: number;
  inboxUrl?: string;
  offUrl?: string;
  settingsUrl?: string;
  privacyUrl?: string;
}

const MessageReminderTemplate = ({
  handle = "maya.lin",
  name = "Maya Lin",
  request = false,
  count = 1,
  inboxUrl = "https://app.amped.bio/inbox",
  offUrl = "https://api.amped.bio/email/messages-off?t=token",
  settingsUrl = "https://app.amped.bio/account?open=messages",
  privacyUrl = "https://amped.bio/privacy",
}: MessageReminderTemplateProps) => {
  const what = count > 1 ? `${count} messages` : "a message";
  const heading = request ? "You have a message request" : `${name} sent you ${what}`;
  const preview = request
    ? `@${handle} wants to message you on Amped.Bio.`
    : `Open your Inbox to read it.`;

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
              <Heading className="text-[24px] leading-[31px] font-bold text-[#16152b] mt-0 mb-0 text-left">
                {heading}
              </Heading>

              <Text className="text-[16px] leading-[26px] text-[#16152b] mt-[21px] text-left">
                {request
                  ? `@${handle} is not someone you follow, so the message is waiting in Requests. Accept it to reply, or delete it. They are not told you saw it.`
                  : `@${handle} wrote to you on Amped.Bio. Open your Inbox to read and reply.`}
              </Text>

              <Section className="mt-[21px]">
                <Button
                  href={inboxUrl}
                  className="block rounded-[13px] px-[21px] py-[17px] text-center text-[16px] font-bold text-white bg-[#5650a2]"
                >
                  {request ? "Open Requests" : "Open Inbox"}
                </Button>
              </Section>

              <Text className="text-[13px] leading-[20px] text-[#3a3858] mt-[13px] text-left">
                Amped.Bio never asks for your wallet recovery phrase or a payment in a message.
              </Text>

              <Hr className="border-t border-[#e8e5ef] my-[25px]" />

              <Text className="text-[13px] leading-[20px] text-[#3a3858] m-0 text-left">
                You get this because a message is still unread after 30 minutes. At most 3 a day.{" "}
                <Link href={offUrl} className="text-[#5650a2] underline">
                  Turn off message emails
                </Link>{" "}
                or change it in{" "}
                <Link href={settingsUrl} className="text-[#5650a2] underline">
                  Account, Messages
                </Link>
                .
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

MessageReminderTemplate.PreviewProps = {
  handle: "maya.lin",
  name: "Maya Lin",
  count: 2,
};

export default MessageReminderTemplate;
