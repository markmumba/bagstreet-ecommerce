/**
 * Stand-in for campaign / editorial photography until real images exist.
 * Warm tonal backdrop with a faint italic caption, so layouts read as intended.
 */
const LIGHT_TONES = ['#efe7dd', '#e8dfd3', '#ede6de', '#e4dace', '#f1ebe3', '#e9e1d8'];
const DARK_TONES = [
  'linear-gradient(160deg, #4a3d33 0%, #2a221d 55%, #1c1714 100%)',
  'linear-gradient(200deg, #5b4a3b 0%, #33291f 60%, #1c1714 100%)',
  'linear-gradient(140deg, #3f4c3b 0%, #2a2f25 55%, #1c1714 100%)',
];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface PlaceholderProps {
  seed: string;
  label?: string;
  tone?: 'light' | 'dark';
  className?: string;
}

export function Placeholder({ seed, label, tone = 'light', className = '' }: PlaceholderProps) {
  const n = hash(seed);
  const dark = tone === 'dark';
  const background = dark ? DARK_TONES[n % DARK_TONES.length] : LIGHT_TONES[n % LIGHT_TONES.length];

  return (
    <div
      role="img"
      aria-label={label ? `${label} (placeholder image)` : 'Placeholder image'}
      className={`overflow-hidden ${/\babsolute\b/.test(className) ? '' : 'relative'} ${className}`}
      style={{ background }}
    >
      {label && (
        <span
          className={`absolute inset-0 flex items-center justify-center px-6 text-center italic text-[clamp(1.5rem,4vw,2.75rem)] ${
            dark ? 'text-background/15' : 'text-foreground/20'
          }`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
