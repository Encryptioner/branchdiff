interface VscodeIconProps {
  className?: string;
}

export function VscodeIcon(props: VscodeIconProps) {
  const { className = 'w-4 h-4' } = props;
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M71.4 2L30.3 38.6 12.2 24.5 2 29v42.1l10.2 4.5 18.1-14.1L71.4 98l26.6-13V15L71.4 2zM30.3 62.1l-16-12.1 16-12.1v24.2zm41.1 15.6L40.7 50l30.7-27.7v55.4z" />
    </svg>
  );
}
