import {
  Body,
  Button,
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

interface EmailChangeTemplateProps {
  code?: string;
  newEmail?: string;
}

const EmailChangeTemplate = ({ code = "123456", newEmail = "new@example.com" }: EmailChangeTemplateProps) => {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>Your email change verification code is {code}</Preview>
        <Body className="bg-[#edf2f7] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#3d4852] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[2px] border border-[#e8e5ef] p-[32px] shadow-sm">
              <Heading className="text-[18px] font-bold text-[#3d4852] m-0 text-left">
                Hello!
              </Heading>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                You've requested to change your email address to <strong>{newEmail}</strong>. 
                Please use the verification code below to confirm this change:
              </Text>

              <Section className="text-center my-[30px]">
                <Text className="bg-[#edf2f7] text-[28px] font-bold text-[#3d4852] px-[18px] py-[8px] rounded-[4px] tracking-[0.2em]">
                  {code}
                </Text>
              </Section>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                If you did not request this email change, please ignore this message or contact support immediately.
              </Text>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                This code will expire in 30 minutes.
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

EmailChangeTemplate.PreviewProps = {
  code: "123456",
  newEmail: "new@example.com",
};

export default EmailChangeTemplate;
