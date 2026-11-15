import { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const CENTER_ROSARIO = [-60.64, -32.95];
const MARKER_COLOR = '#15803d';

function validPoint(latitude, longitude) {
  if (latitude === '' || longitude === '') return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null;
}

export default function MapPicker({ latitude, longitude, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pickRef = useRef(onPick);
  const [satellite, setSatellite] = useState(true);
  const [error, setError] = useState('');
  pickRef.current = onPick;

  useEffect(() => {
    const initial = validPoint(latitude, longitude);
    const map = new Map({
      container: containerRef.current,
      style: STYLE,
      center: initial ?? CENTER_ROSARIO,
      zoom: initial ? 14 : 6,
      attributionControl: { compact: true },
      maxZoom: 19,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.getCanvas().style.cursor = 'crosshair';
    if (initial) markerRef.current = new Marker({ color: MARKER_COLOR }).setLngLat(initial).addTo(map);

    map.on('style.load', () => {
      map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
      const firstLayer = map.getStyle().layers?.find(({ type }) => type !== 'background')?.id;
      map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite' }, firstLayer);
    });
    map.on('error', (event) => {
      if (!map.isStyleLoaded()) setError(event.error?.message || 'No se pudo cargar el mapa. Revisá tu conexión.');
    });
    map.on('click', ({ lngLat }) => pickRef.current(lngLat.lat, lngLat.lng));

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // El mapa se crea una sola vez; las coordenadas se sincronizan en el efecto siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const point = validPoint(latitude, longitude);
    if (!map || !point) return;
    if (markerRef.current) markerRef.current.setLngLat(point);
    else markerRef.current = new Marker({ color: MARKER_COLOR }).setLngLat(point).addTo(map);
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
  }, [satellite]);

  return (
    <div className="map-picker">
      <div ref={containerRef} className="map-picker-canvas" />
      <button type="button" className="map-chip map-picker-toggle" onClick={() => setSatellite((value) => !value)}>
        {satellite ? 'Ver mapa' : 'Ver satélite'}
      </button>
      {error && <div className="map-message map-message--error" role="alert">{error}</div>}
    </div>
  );
}
