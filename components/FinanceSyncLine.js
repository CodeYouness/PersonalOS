/**
 * The broker's staleness under the net worth (ticket #216): "Scalable ·
 * synced N days ago", the warning colour past 7 days, the error after a
 * failed run. From brokerStaleness(); absent when the broker never ran.
 *
 * @param {{ staleness: import('@/lib/domain/derive/sync-staleness.js').BrokerStaleness | null }} props
 */
export default function FinanceSyncLine({ staleness }) {
  if (staleness === null) return null;
  const tone = staleness.tone === 'warning' ? ' due' : staleness.tone === 'error' ? ' down' : '';
  return (
    <p className={'caption finance-sync' + tone}>
      {staleness.text}
      {staleness.error !== null && ' · ' + staleness.error}
    </p>
  );
}
