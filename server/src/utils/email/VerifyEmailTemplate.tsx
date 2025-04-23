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

const VerifyEmailTemplate = ({ url = "https://example.com/verify-email" }) => {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>Please verify your email address</Preview>
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
                Please click the button below to verify your email address.
              </Text>

              <Section className="text-center my-[30px]">
                <Button
                  className="bg-[#2d3748] text-white px-[18px] py-[8px] rounded-[4px] font-medium no-underline text-center box-border"
                  href={url}
                >
                  Verify Email Address
                </Button>
              </Section>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                If you did not create an account, no further action is required.
              </Text>

              <Text className="text-[16px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                Regards,
                <br />
                Amped.Bio
              </Text>

              <Hr className="border-t border-[#e8e5ef] my-[25px]" />

              <Text className="text-[14px] leading-[1.5em] text-[#3d4852] mt-0 text-left">
                If you're having trouble clicking the "Verify Email Address" button, copy and paste
                the URL below into your web browser:
              </Text>

              <Text className="text-[14px] leading-[1.5em] text-[#3869d4] mt-0 text-left break-all">
                <a href={url} className="text-[#3869d4]">
                  {url}
                </a>
              </Text>
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

VerifyEmailTemplate.PreviewProps = {
  url: "https://example.com/verify-email?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
};

export default VerifyEmailTemplate;
