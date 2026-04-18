interface DeltaIconProps {
  className?: string;
}

export function DeltaIcon({ className = 'w-4 h-4' }: DeltaIconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5L1 14.5h14L8 1.5zm0 2.236L13.382 13H2.618L8 3.736z" />
    </svg>
  );
}
