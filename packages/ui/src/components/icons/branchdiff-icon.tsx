import type { SVGProps } from 'react';

export function BranchDiffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3c2 0 3.5 2 3.5 2l2.5 4.5c.5 1 .5 2 0 3L15.5 17s-1.5 2-3.5 2-3.5-2-3.5-2L6 12.5c-.5-1-.5-2 0-3L8.5 5s1.5-2 3.5-2z" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
