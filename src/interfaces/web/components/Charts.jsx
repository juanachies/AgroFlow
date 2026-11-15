import { columnasConDatos, promedio } from '../lib/data.js';

function compactDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

export function WeatherChart({ title, unit, points, color = 'green', note }) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const span = maximum - minimum;

  return (
    <section className="chart-card">
      <div className="chart-heading">
        <div><h3>{title}</h3>{note && <p>{note}</p>}</div>
        {values.length > 0 && <span className="chart-range">{minimum.toFixed(1)}–{maximum.toFixed(1)} {unit}</span>}
      </div>
      {points.length ? (
        <div className="chart-bars" role="img" aria-label={`${title}, ${points.length} valores`}>
          {points.map((point) => {
            const value = Number.isFinite(point.value) ? point.value : null;
            const height = value === null ? 0 : span === 0 ? 56 : 12 + ((value - minimum) / span) * 56;
            return (
              <div className="chart-column" key={point.date} title={`${compactDate(point.date)}: ${value === null ? 'sin dato' : `${value.toFixed(1)} ${unit}`}`}>
                <span className={`chart-bar chart-bar--${color}`} style={{ height: `${height}px` }} />
                <span className="chart-value">{value === null ? '—' : value.toFixed(0)}</span>
                <span className="chart-date">{compactDate(point.date)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="chart-empty">Esta serie no está disponible en los datos importados.</div>
      )}
    </section>
  );
}

const FORECAST_COLUMNS = [
  { key: 'date', label: 'Fecha', valor: (day) => compactDate(day.date) },
  { key: 'rain', label: 'Lluvia pronosticada', valor: (day) => (Number.isFinite(day.precipitationMm) ? `${day.precipitationMm.toFixed(1)} mm` : null) },
  { key: 'probability', label: 'Prob. máxima', valor: (day) => (Number.isFinite(day.precipitationProbabilityMaxPercent) ? `${Math.round(day.precipitationProbabilityMaxPercent)}%` : null) },
  { key: 'temperature', label: 'T. mín. / máx.', valor: (day) => (Number.isFinite(day.temperatureMinC) && Number.isFinite(day.temperatureMaxC)
    ? `${day.temperatureMinC.toFixed(0)}° / ${day.temperatureMaxC.toFixed(0)}°`
    : null) },
  { key: 'moisture', label: 'Humedad de suelo', valor: (day) => {
    const meanMoisture = promedio(Object.values(day.soilMoistureHourly ?? {}).flat());
    return meanMoisture === null ? null : `${meanMoisture.toFixed(3)} m³/m³ · modelo`;
  } },
];

export function ForecastTable({ days }) {
  const columns = columnasConDatos(days, FORECAST_COLUMNS);
  return (
    <div className="table-scroll">
      <table className="forecast-table">
        <thead>
          <tr>{columns.map(({ key, label }) => <th key={key}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              {columns.map(({ key, valor }) => <td key={key}>{valor(day) ?? 'Sin dato'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

