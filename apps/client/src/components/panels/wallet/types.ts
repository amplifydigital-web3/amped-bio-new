export type StatBoxProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tooltip: string;
  color: string;
  soon?: boolean;
};
