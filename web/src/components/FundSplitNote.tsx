/**Note under a position title showing how the PDF splits that title's pay between funds.*/

import { FUND_SPLIT_LABEL, type FundShare } from '../lib/personnel';

interface Props {
  split: FundShare[] | null | undefined;
  /** Published page per section slug (see publishedSectionHrefs); a fund without one shows as plain text. */
  sectionHrefs: Record<string, string>;
}

export default function FundSplitNote({ split, sectionHrefs }: Props) {
  if (!split || split.length === 0) return null;
  return (
    <div class="text-xs text-gray-500 mt-0.5">
      {FUND_SPLIT_LABEL}:{' '}
      {split.map((share, i) => (
        <span key={share.slug}>
          {i > 0 && ', '}
          {share.percent}%{' '}
          {sectionHrefs[share.slug] ? (
            <a href={sectionHrefs[share.slug]} class="text-ps-blue-600 hover:underline">{share.fund}</a>
          ) : (
            share.fund
          )}
        </span>
      ))}
    </div>
  );
}
