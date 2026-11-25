/** Minigráfico de 30 dias (SVG puro, renderiza no servidor e na impressão). */
export function Sparkline({ data, color = "#1e3a5f", width = 120, height = 32 }: { data: Array<{ value: number | null }>; color?: string; width?: number; height?: number }) {
  const vals = data.map((d) => d.value).filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  let d = "";
  let pen = false;
  data.forEach((p, i) => {
    if (p.value == null || !Number.isFinite(p.value)) {
      pen = false;
      return;
    }
    const x = i * step;
    const y = height - 2 - ((p.value - min) / span) * (height - 4);
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    pen = true;
  });
  const last = [...data].reverse().find((p) => p.value != null);
  const lx = width;
  const ly = last?.value != null ? height - 2 - ((last.value - min) / span) * (height - 4) : height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}
