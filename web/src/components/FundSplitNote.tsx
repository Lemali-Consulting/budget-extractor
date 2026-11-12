/**Note under a position title showing how the PDF splits that title's pay between funds.*/

import { FUND_SPLIT_LABEL, type FundShare } from '../lib/personnel';

interface Props {
  split: FundShare[] | null | undefined;
  /** Route prefix of the budget year's pages ("" headline, "/2026" archive). */
  routePrefix: string;
}

export default function FundSplitNote({ split, routePrefix }: Props) {
  if (!split || split.length === 0) return null;
  return (
    <div class="text-xs text-gray-500 mt-0.5">
      {FUND_SPLIT_LABEL}:{' '}
      {split.map((share, i) => (
        <span key={share.slug}>
          {i > 0 && ', '}
          {share.percent}%{' '}
          <a href={`${routePrefix}/sections/${share.slug}/`} class="text-ps-blue-600 hover:underline">{share.fund}</a>
        </span>
      ))}
    </div>
  );
}
