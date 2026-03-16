/**Inline glossary tooltip — renders a dotted-underline term with hover/focus tooltip.*/

interface Props {
  term: string;
  tooltip: string;
  anchor?: string;
  class?: string;
}

export default function GlossaryTip({ term, tooltip, anchor = 'abbreviations', class: className }: Props) {
  return (
    <a
      href={`/glossary/#${anchor}`}
      class={`glossary-term ${className || ''}`}
      tabIndex={0}
      data-tooltip={tooltip.length > 120 ? tooltip.slice(0, 117) + '...' : tooltip}
    >
      {term}
    </a>
  );
}
