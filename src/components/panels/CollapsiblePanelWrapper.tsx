'use client';

import type React from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface CollapsiblePanelWrapperProps {
  initialOpen?: boolean;
  title: string;
  children: React.ReactNode;
}

const CollapsiblePanelWrapper: React.FC<CollapsiblePanelWrapperProps> = ({
  initialOpen,
  title,
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(
    initialOpen !== undefined ? !initialOpen : true
  );

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <Collapsible open={!isCollapsed}>
      <CollapsibleTrigger
        onClick={toggleCollapse}
        className="flex w-full items-center justify-between py-2"
      >
        <label className="text-sm font-medium text-gray-700 cursor-pointer">
          {title}
        </label>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
            !isCollapsed ? 'rotate-180' : ''
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsiblePanelWrapper;
