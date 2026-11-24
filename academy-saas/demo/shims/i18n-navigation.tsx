import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate, useRoute, type Href } from './router';

export function Link({ href, onClick, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: Href }) {
  const target = typeof href === 'string' ? href : href.pathname;
  return (
    <a href={`#${target.replace(/^\//, '').split(/[/?]/)[0]}`} {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onClick?.(e); navigate(href); }} />
  );
}
export function usePathname() { return useRoute().path; }
export function useRouter() {
  return { push: navigate, replace: navigate, back: () => navigate('/dashboard'), refresh: () => {}, prefetch: () => {} };
}
export function redirect({ href }: { href: string }) { navigate(href); }
export const getPathname = ({ href }: { href: string }) => href;
