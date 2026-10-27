"use client";

import { Users } from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";
import type { ThemeConfig } from "@repo/constants";
import { TextBlock as TextBlockT } from "@repo/constants";
import { CREATOR_FOCUS } from "./frame";

interface TeamMember {
  name: string;
  role: string;
  twitter: string;
  avatar: string;
}

interface TeamBlockProps {
  block: TextBlockT;
  theme: ThemeConfig;
}

// Screen Review 040 I13: no forced grays or blues. Icons 21 and text in the
// creator's color, names 16/20 600, roles 13/16, avatars 34. No members, no block.
export function TeamBlock({ block, theme }: TeamBlockProps) {
  let members: TeamMember[] = [];
  try {
    const parsed = JSON.parse(block.config.content);
    members = Array.isArray(parsed) ? parsed : [];
  } catch {
    members = [];
  }
  if (members.length === 0) return null;
  const text = { fontFamily: theme.fontFamily, color: theme.fontColor };

  return (
    <div className="w-full space-y-[13px] px-[21px] py-[13px]" style={text}>
      <div className="flex items-center gap-2">
        <Users aria-hidden className="h-[21px] w-[21px] shrink-0" />
        <h3 className="text-[16px] font-semibold leading-[20px]">Our Team</h3>
      </div>
      <ul className="grid grid-cols-1 gap-[13px] sm:grid-cols-2">
        {members.map((member, index) => (
          <li key={index} className="flex items-center gap-[13px]">
            {member.avatar ? (
              <img
                src={member.avatar}
                alt=""
                className="h-[34px] w-[34px] shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="h-[34px] w-[34px] shrink-0 rounded-full bg-current opacity-20"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold leading-[20px]">{member.name}</p>
              {member.role && <p className="text-[13px] leading-[16px]">{member.role}</p>}
              {member.twitter && (
                <a
                  href={`https://x.com/${member.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex min-h-[44px] items-center gap-1 text-[13px] leading-[16px] underline-offset-2 hover:underline ${CREATOR_FOCUS}`}
                >
                  <FaXTwitter aria-hidden className="h-[13px] w-[13px]" />@{member.twitter}
                  <span className="sr-only"> on X (opens in a new tab)</span>
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
