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

// Fan Library daily email (Build Board #26, FL-6, spec 3.4). At most one a day per
// creator, only to a fan who chose Email me updates when they followed. It lists the
// titles of new items the fan can open, never an 18+ title, never media or a price.
// The footer carries the one tap off for this creator and the company postal address
// (CAN-SPAM); the job sends nothing while the address is empty.

export interface LibraryDigestItem {
  title: string;
  kind: string;
}

interface LibraryDigestTemplateProps {
  handle?: string;
  name?: string;
  items?: LibraryDigestItem[];
  more?: number;
  sectionUrl?: string;
  offUrl?: string;
  libraryUrl?: string;
  privacyUrl?: string;
  postalAddress?: string;
}

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  image: "Photo",
  document: "Document",
  file: "File",
};

const LibraryDigestTemplate = ({
  handle = "maya.lin",
  name = "Maya Lin",
  items = [{ title: "Studio session 12", kind: "video" }],
  more = 0,
  sectionUrl = "https://app.amped.bio/library/@maya.lin",
  offUrl = "https://api.amped.bio/email/updates-off?t=token",
  libraryUrl = "https://app.amped.bio/library",
  privacyUrl = "https://amped.bio/privacy",
  postalAddress = "",
}: LibraryDigestTemplateProps) => {
  const count = items.length + more;
  const heading = count > 1 ? `${count} new from ${name}` : `New from ${name}`;

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{`@${handle} posted on Amped.Bio.`}</Preview>
        <Body className="bg-[#f4f3fa] font-sans py-[40px]">
          <Container className="max-w-[570px] mx-auto">
            <Section className="text-center py-[25px]">
              <Text className="text-[#16152b] text-[19px] font-bold">Amped.Bio</Text>
            </Section>

            <Container className="bg-white rounded-[13px] border border-[#e8e5ef] p-[32px]">
              <Heading className="text-[24px] leading-[31px] font-bold text-[#16152b] mt-0 mb-0 text-left">
                {heading}
              </Heading>

              {items.map(item => (
                <Text
                  key={`${item.kind}-${item.title}`}
                  className="text-[16px] leading-[26px] text-[#16152b] mt-[13px] mb-0 text-left"
                >
                  <span className="text-[13px] text-[#3a3858]">
                    {KIND_LABEL[item.kind] ?? "Item"}
                  </span>{" "}
                  {item.title}
                </Text>
              ))}
              {more > 0 && (
                <Text className="text-[13px] leading-[20px] text-[#3a3858] mt-[13px] mb-0 text-left">
                  {more === 1 ? "And 1 more." : `And ${more} more.`}
                </Text>
              )}

              <Section className="mt-[21px]">
                <Button
                  href={sectionUrl}
                  className="block rounded-[13px] px-[21px] py-[17px] text-center text-[16px] font-bold text-white bg-[#5650a2]"
                >
                  Open in your Library
                </Button>
              </Section>

              <Hr className="border-t border-[#e8e5ef] my-[25px]" />

              <Text className="text-[13px] leading-[20px] text-[#3a3858] m-0 text-left">
                You get this because you chose Email me updates when you followed @{handle}. One
                email a day at most.{" "}
                <Link href={offUrl} className="text-[#5650a2] underline">
                  Stop emails from @{handle}
                </Link>{" "}
                or change it in{" "}
                <Link href={libraryUrl} className="text-[#5650a2] underline">
                  your Library
                </Link>
                .
              </Text>
            </Container>

            <Section className="text-center py-[32px]">
              <Text className="text-[12px] leading-[1.5em] text-[#524f73] m-0">
                © 2026 Oneiro N.A., Inc., dba Amplify Digital. All rights reserved.
              </Text>
              <Text className="text-[12px] leading-[1.5em] text-[#524f73] m-0">
                {postalAddress}
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

LibraryDigestTemplate.PreviewProps = {
  handle: "maya.lin",
  name: "Maya Lin",
  items: [
    { title: "Studio session 12", kind: "video" },
    { title: "Demo, rough mix", kind: "audio" },
  ],
  postalAddress: "Company address",
};

export default LibraryDigestTemplate;
