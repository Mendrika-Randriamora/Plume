export interface LegendItem {
  color: string;
  label: string;
  value: string;
  detail?: string;
}

/** Légende sous un graphique : pastille de couleur, valeur courante et total. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <div key={item.label} className="chart-legend-item">
          <span className="chart-swatch" style={{ background: item.color }} />
          <div>
            <div>
              <span className="muted small">{item.label}</span> <b>{item.value}</b>
            </div>
            {item.detail && <div className="muted small">{item.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
