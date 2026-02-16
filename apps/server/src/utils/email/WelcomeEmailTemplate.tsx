import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";

interface WelcomeEmailTemplateProps {
  name?: string;
}

const WelcomeEmailTemplate = ({ name }: WelcomeEmailTemplateProps) => {
  const greeting = name ? `Hello, ${name}!` : "Hello!";

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>Welcome to Amped.Bio!</Preview>
        <Body className="bg-[#edf2f7] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#3d4852] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[2px] border border-[#e8e5ef] p-[32px] shadow-sm">
              <Heading className="text-[18px] font-bold text-[#3d4852] m-0 text-left">
                {greeting}
              </Heading>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                Welcome to Amped.Bio! We're excited to have you on board.
              </Text>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                Join our growing community on Telegram to stay updated with the latest news, connect
                with other users, and get support.
              </Text>

              <Section className="text-center my-[30px]">
                <a
                  href="https://t.me/the_revolution_network/1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center space-x-2 px-4 py-3 bg-[#EBF8FF] hover:bg-[#BEE3F8] text-[#2B6CB0] rounded-lg transition-colors duration-200"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#229ED9">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.015-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.1.154.234.17.33.014.095.032.312.017.481z" />
                  </svg>
                  <span className="font-medium">Join our community on Telegram!</span>
                </a>
              </Section>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                We're looking forward to seeing you there!
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
                © 2025 Amplify Digital. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

WelcomeEmailTemplate.PreviewProps = {
  name: "John",
};

export default WelcomeEmailTemplate;
