import Link from 'next/link';

/**
 * A segmented control of links (docs/design/ui-rules.md, Buttons and links):
 * one bordered box of joined segments, the chosen one on `--surface-4` with an
 * ink ring -- a choice of one among a few that the address holds
 * (`?period=`, `?view=`, `?span=`), never an action, which is a button. Each
 * segment is a link to the place with that choice, marked `aria-current` when
 * it is the one chosen; the group is named by what it chooses.
 *
 * @param {{
 *   label: string,
 *   options: { key: string, href: string, on: boolean, children: import('react').ReactNode }[],
 *   className?: string,
 * }} props
 */
export default function Segmented({ label, options, className = '' }) {
  return (
    <div className={'segmented is-joined' + (className === '' ? '' : ' ' + className)} role="group" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          scroll={false}
          className={'seg' + (option.on ? ' is-on' : '')}
          aria-current={option.on ? 'true' : undefined}
        >
          {option.children}
        </Link>
      ))}
    </div>
  );
}
