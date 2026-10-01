import React from "react";
import {
  Body,
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

// Screen Review 019 I02. Sent to the current address when someone asks to
// change the sign in email. The code itself goes to the new address.

interface EmailChangeNoticeTemplateProps {
  newEmail?: string;
  privacyUrl?: string;
}

const EmailChangeNoticeTemplate = ({
  newEmail = "new@example.com",
  privacyUrl = "https://amped.bio/privacy",
}: EmailChangeNoticeTemplateProps) => {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>Someone asked to change your Amped.Bio sign in email</Preview>
        <Body className="bg-[#edf2f7] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#3d4852] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[2px] border border-[#e8e5ef] p-[32px] shadow-sm">
              <Heading className="text-[18px] font-bold text-[#3d4852] m-0 text-left">
                Email change requested
              </Heading>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                Someone asked to change the sign in email for your Amped.Bio account to{" "}
                <strong>{newEmail}</strong>. We sent a code to that address. The change happens only
                if the code is entered.
              </Text>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                If this was you, there is nothing else to do. If it was not, reset your password and
                contact support.
              </Text>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
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

EmailChangeNoticeTemplate.PreviewProps = {
  newEmail: "new@example.com",
};

export default EmailChangeNoticeTemplate;
