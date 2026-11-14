import { promedio } from '../lib/data.js';

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

export function ForecastTable({ days }) {
  return (
    <div className="table-scroll">
      <table className="forecast-table">
        <thead>
          <tr><th>Fecha</th><th>Lluvia pronosticada</th><th>Prob. máxima</th><th>T. mín. / máx.</th><th>Humedad de suelo</th><th>Tránsito</th></tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const moisture = Object.values(day.soilMoistureHourly ?? {}).flat();
            const meanMoisture = promedio(moisture);
            return (
              <tr key={day.date}>
                <td>{compactDate(day.date)}</td>
                <td>{Number.isFinite(day.precipitationMm) ? `${day.precipitationMm.toFixed(1)} mm` : 'Sin dato'}</td>
                <td>{Number.isFinite(day.precipitationProbabilityMaxPercent) ? `${Math.round(day.precipitationProbabilityMaxPercent)}%` : 'Sin dato'}</td>
                <td>{Number.isFinite(day.temperatureMinC) && Number.isFinite(day.temperatureMaxC)
                  ? `${day.temperatureMinC.toFixed(0)}° / ${day.temperatureMaxC.toFixed(0)}°`
                  : 'Sin dato'}</td>
                <td>{meanMoisture === null ? 'Sin dato' : `${meanMoisture.toFixed(3)} m³/m³ · modelo`}</td>
                <td><span className="status-pill status-pill--muted">Sin evaluación</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

