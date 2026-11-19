import Link from 'next/link';

/**
 * A segmented control of links (docs/design/ui-rules.md, Buttons and links):
 * one bordered box of joined segments, the chosen one on `--surface-4` with an
 * ink ring -- a choice of one among a few that the address holds
 * (`?period=`, `?view=`, `?span=`), never an action, which is a button. Each
 * segment is a link to the place with that choice, marked `aria-current` when
 * it is the one chosen; the group is named by what it chooses.
 *
 * A segment with a `name` is its glyph alone (ADR 0060): a 44px square whose
 * children are only the glyph, named by `name` for a screen reader
 * (`aria-label`) and for a mouse (`title`). Without one, the children are
 * the segment's word, with its glyph before it when it has one.
 *
 * @param {{
 *   label: string,
 *   options: { key: string, href: string, on: boolean, name?: string, children: import('react').ReactNode }[],
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
          className={'seg' + (option.name === undefined ? '' : ' is-glyph') + (option.on ? ' is-on' : '')}
          aria-current={option.on ? 'true' : undefined}
          aria-label={option.name}
          title={option.name}
        >
          {option.children}
        </Link>
      ))}
    </div>
  );
}
