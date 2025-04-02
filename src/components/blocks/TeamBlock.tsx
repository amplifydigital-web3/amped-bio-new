import { Users } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import type { TextBlock as TextBlockType, ThemeConfig } from '../../types/editor';

interface TeamMember {
  name: string;
  role: string;
  twitter: string;
  avatar: string;
}

interface TeamBlockProps {
  block: TextBlockType;
  theme: ThemeConfig;
}

export function TeamBlock({ block, theme }: TeamBlockProps) {
  let teamMembers: TeamMember[] = [];

  try {
    teamMembers = JSON.parse(block.content);
  } catch {
    teamMembers = [];
  }

  if (teamMembers.length === 0) {
    return (
      <div className="w-full p-6 rounded-lg bg-gray-50/50 backdrop-blur-sm space-y-2">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-400" />
          <h3
            className="font-medium text-gray-400"
            style={{ fontFamily: theme.fontFamily }}
          >
            Add Team Members
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 rounded-lg bg-white/50 backdrop-blur-sm space-y-6">
      <div className="flex items-center space-x-2">
        <Users className="w-5 h-5 text-gray-600" />
        <h3
          className="font-medium text-gray-900"
          style={{
            fontFamily: theme.fontFamily,
            color: theme.fontColor
          }}
        >
          Our Team
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {teamMembers.map((member, index) => (
          <div key={index} className="flex items-center space-x-3">
            <img
              src={member.avatar}
              alt={member.name}
              className="w-12 h-12 rounded-full object-cover"
            />
            <div>
              <h4
                className="font-medium"
                style={{
                  fontFamily: theme.fontFamily,
                  color: theme.fontColor
                }}
              >
                {member.name}
              </h4>
              <p
                className="text-sm text-gray-500"
                style={{ fontFamily: theme.fontFamily }}
              >
                {member.role}
              </p>
              <a
                href={`https://x.com/${member.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-sm text-blue-500 hover:text-blue-600 mt-1"
              >
                <FaXTwitter className="w-3 h-3" />
                <span>@{member.twitter}</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}