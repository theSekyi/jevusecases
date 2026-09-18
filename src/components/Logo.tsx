export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="jevusecases">
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="2" />
      <text
        x="50"
        y="66"
        textAnchor="middle"
        fontFamily="var(--font-bp-mono)"
        fontWeight={700}
        fontSize={46}
        fill="currentColor"
      >
        J
      </text>
    </svg>
  );
}
