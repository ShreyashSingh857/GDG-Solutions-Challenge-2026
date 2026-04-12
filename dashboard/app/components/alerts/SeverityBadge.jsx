'use client';

/**
 * Displays a coloured severity badge.
 * @param {object} props
 * @param {number} props.severity - 1 to 10
 * @param {boolean} [props.showLabel] - show text label alongside number
 */
export default function SeverityBadge({ severity, showLabel = true }) {
  let label, colorClasses;

  if (severity >= 8) {
    label = 'CRITICAL';
    colorClasses = 'bg-red-900/60 text-red-300 border border-red-700/50';
  } else if (severity >= 6) {
    label = 'HIGH';
    colorClasses = 'bg-orange-900/60 text-orange-300 border border-orange-700/50';
  } else if (severity >= 4) {
    label = 'MEDIUM';
    colorClasses = 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50';
  } else {
    label = 'LOW';
    colorClasses = 'bg-green-900/60 text-green-300 border border-green-700/50';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses}`}>
      {showLabel && <span>{label}</span>}
      <span className="font-mono">{severity}/10</span>
    </span>
  );
}
