import { toPersianDigits } from '../../shared/dormRules';

interface DonutGaugeProps {
  percent: number;
  color: 'blue' | 'emerald';
  size?: number;
  strokeWidth?: number;
}

export function DonutGauge({
  percent,
  color,
  size = 132,
  strokeWidth = 14,
}: DonutGaugeProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor = color === 'emerald' ? '#10B981' : '#2563EB';
  const trackColor = '#E2E8F0';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold text-slate-800 tabular-nums leading-none">
          {toPersianDigits(clamped)}٪
        </span>
        <span className="text-xs font-medium text-slate-500 mt-1">اشغال</span>
      </div>
    </div>
  );
}
