export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="jevusecases">
      <circle cx="50" cy="50" r="46" style={{ fill: "var(--color-bp-accent)" }} />
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontFamily="var(--font-bp-mono)"
        fontWeight={700}
        fontSize={56}
        style={{ fill: "var(--color-bp-bg)" }}
      >
        J
      </text>
    </svg>
  );
}
