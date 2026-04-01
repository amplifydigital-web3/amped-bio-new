interface Props {
  value: string;
  isValid: boolean;
}

function getCriteriaItems(value: string) {
  const clean = value.endsWith(".eth") ? value.slice(0, -4) : value;
  return [
    { label: "6–32 characters", pass: clean.length >= 6 && clean.length <= 32 },
    { label: "Only alphanumeric characters & hyphens", pass: /^[a-z0-9-]*$/.test(clean) },
  ];
}

export default function NameCriteriaTooltip({ value }: Props) {
  const criteria = getCriteriaItems(value);

  return (
    <ul className="w-full border-t border-gray-100 pt-2 mt-1 space-y-1">
      {criteria.map(c => (
        <li key={c.label} className="flex items-center gap-2 text-xs">
          <span className={c.pass ? "text-green-500" : "text-[#f26868]"}>{c.pass ? "✓" : "✗"}</span>
          <span className={c.pass ? "text-green-500" : "text-[#f26868]"}>{c.label}</span>
        </li>
      ))}
    </ul>
  );
}
