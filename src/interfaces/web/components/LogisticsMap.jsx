import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map, NavigationControl, Popup, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { RECURSOS } from '../lib/logistica.js';

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const CENTER_ROSARIO = [-60.64, -32.95];
const LABEL_FONT = ['Noto Sans Regular'];

export const CAPAS = [
  { id: 'lotes', label: 'Lotes', color: '#22c55e' },
  { id: 'silobolsas', label: 'Silobolsas', color: '#14b8a6' },
  { id: 'acopios', label: 'Acopios (ejemplo)', color: '#f59e0b' },
  { id: 'fleteros', label: 'Fleteros', color: '#3b82f6' },
  { id: 'puertos', label: 'Puertos', color: '#6366f1' },
];

const collection = (features) => ({ type: 'FeatureCollection', features });
const point = (longitude, latitude, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [longitude, latitude] },
});
const line = (from, to, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: [from, to] },
});

function buildData({ lots, selectedLot, silobolsas, acopios, puertos, fleteros, destino }) {
  const bases = new globalThis.Map();
  for (const oferta of fleteros) {
    const key = `${oferta.base.lat},${oferta.base.lon}`;
    const base = bases.get(key) ?? { lat: oferta.base.lat, lon: oferta.base.lon, localidad: oferta.base.localidad, ofertas: [] };
    base.ofertas.push(oferta);
    bases.set(key, base);
  }
  const puertoDestino = puertos.find((puerto) => puerto.id === destino);

  return {
    lotes: collection(lots.map((lot) => point(lot.longitude, lot.latitude, {
      kind: 'Lote', name: lot.name, detail: `${lot.areaHa} ha`, selected: lot.id === selectedLot?.id,
    }))),
    silobolsas: collection(silobolsas.map(({ bolsa, lote, latitude, longitude }) => point(longitude, latitude, {
      kind: 'Silobolsa', name: bolsa.id, detail: `${bolsa.cultivo} · ${Math.round(bolsa.kg / 100).toLocaleString('es-AR')} qq · ${lote.name}`,
    }))),
    acopios: collection(acopios.map((acopio) => point(acopio.longitude, acopio.latitude, {
      kind: 'Acopio', name: acopio.name, detail: 'Dato de ejemplo',
    }))),
    fleteros: collection([...bases.values()].map((base) => point(base.lon, base.lat, {
      kind: 'Base de fleteros',
      name: base.localidad ?? 'Base',
      detail: base.ofertas.map((o) => `${o.unidades} ${o.recurso}`).join(' · '),
      color: RECURSOS[base.ofertas[0].recurso]?.color ?? '#3b82f6',
    }))),
    puertos: collection(puertos.map((puerto) => point(puerto.longitude, puerto.latitude, {
      kind: 'Puerto', name: puerto.label, detail: puerto.id === destino ? 'Destino recomendado' : 'Puerto de referencia',
    }))),
    enlaces: collection(selectedLot ? [...bases.values()].slice(0, 25).map((base) => line(
      [selectedLot.longitude, selectedLot.latitude], [base.lon, base.lat], { kind: 'fletero' },
    )) : []),
    ruta: collection(selectedLot && puertoDestino
      ? [line([selectedLot.longitude, selectedLot.latitude], [puertoDestino.longitude, puertoDestino.latitude], { kind: 'ruta' })]
      : []),
  };
}

function installLayers(map, data, satellite) {
  if (!map.getSource('satellite')) {
    map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
  }
  const firstLayer = map.getStyle().layers?.find(({ type }) => type !== 'background')?.id;
  if (!map.getLayer('satellite-base')) {
    map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite', layout: { visibility: satellite ? 'visible' : 'none' } }, firstLayer);
  }
  for (const [id, value] of Object.entries(data)) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: value });
  }
  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  const label = (id, source, size = 12) => add({
    id, type: 'symbol', source,
    layout: { 'text-field': ['get', 'name'], 'text-font': LABEL_FONT, 'text-size': size, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#0f172a', 'text-halo-width': 1.6 },
  });
  const dot = (id, source, color, radius) => add({
    id, type: 'circle', source,
    paint: { 'circle-radius': radius, 'circle-color': color, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' },
  });

  add({ id: 'enlaces-fleteros', type: 'line', source: 'enlaces', paint: { 'line-color': '#60a5fa', 'line-width': 1.4, 'line-opacity': 0.55 } });
  add({ id: 'ruta-destino', type: 'line', source: 'ruta', paint: { 'line-color': '#facc15', 'line-width': 3.5, 'line-dasharray': [2, 1.4] } });
  dot('capa-acopios', 'acopios', '#f59e0b', 7);
  dot('capa-fleteros', 'fleteros', ['get', 'color'], 7.5);
  dot('capa-puertos', 'puertos', '#6366f1', 10);
  dot('capa-silobolsas', 'silobolsas', '#14b8a6', 6.5);
  dot('capa-lotes', 'lotes', ['case', ['get', 'selected'], '#16a34a', '#22c55e'], ['case', ['get', 'selected'], 11, 8]);
  label('etiquetas-lotes', 'lotes', 13);
  label('etiquetas-puertos', 'puertos', 12);
}

const LAYER_OF = {
  lotes: ['capa-lotes', 'etiquetas-lotes'],
  silobolsas: ['capa-silobolsas'],
  acopios: ['capa-acopios'],
  fleteros: ['capa-fleteros', 'enlaces-fleteros'],
  puertos: ['capa-puertos', 'etiquetas-puertos', 'ruta-destino'],
};
const CLICKABLE = ['capa-lotes', 'capa-silobolsas', 'capa-acopios', 'capa-fleteros', 'capa-puertos'];

export default function LogisticsMap({ lots, selectedLot, silobolsas, acopios, puertos, fleteros, destino, visible, theme = 'light', onSelectLot }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(null);
  const visibleRef = useRef(visible);
  const selectRef = useRef(onSelectLot);
  const lotsRef = useRef(lots);
  const [satellite, setSatellite] = useState(true);
  const [error, setError] = useState('');
  const satelliteRef = useRef(satellite);

  const data = useMemo(
    () => buildData({ lots, selectedLot, silobolsas, acopios, puertos, fleteros, destino }),
    [lots, selectedLot, silobolsas, acopios, puertos, fleteros, destino],
  );
  dataRef.current = data;
  visibleRef.current = visible;
  satelliteRef.current = satellite;
  selectRef.current = onSelectLot;
  lotsRef.current = lots;

  function applyVisibility(map) {
    for (const [capa, ids] of Object.entries(LAYER_OF)) {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibleRef.current[capa] ? 'visible' : 'none');
      }
    }
  }

  useEffect(() => {
    const map = new Map({
      container: containerRef.current,
      style: STYLES[theme] ?? STYLES.light,
      center: selectedLot ? [selectedLot.longitude, selectedLot.latitude] : CENTER_ROSARIO,
      zoom: selectedLot ? 8 : 6,
      attributionControl: { compact: true },
      maxZoom: 18,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

    map.on('style.load', () => {
      try {
        installLayers(map, dataRef.current, satelliteRef.current);
        applyVisibility(map);
        setError('');
      } catch (reason) {
        setError(reason.message || 'No se pudo preparar el mapa.');
      }
    });
    map.on('error', (event) => {
      if (!map.isStyleLoaded()) setError(event.error?.message || 'No se pudo cargar la cartografía. Revisá tu conexión.');
    });

    map.on('click', (event) => {
      const layers = CLICKABLE.filter((id) => map.getLayer(id));
      const [feature] = map.queryRenderedFeatures(event.point, { layers });
      if (!feature) return;
      const { kind, name, detail } = feature.properties;
      const box = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = name;
      const sub = document.createElement('div');
      sub.textContent = `${kind}${detail ? ` · ${detail}` : ''}`;
      box.append(title, sub);
      new Popup({ closeButton: false, offset: 14 }).setLngLat(feature.geometry.coordinates).setDOMContent(box).addTo(map);
      if (kind === 'Lote') {
        const lot = lotsRef.current.find((item) => item.name === name);
        if (lot) selectRef.current?.(lot.id);
      }
    });
    for (const id of CLICKABLE) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }

    return () => { map.remove(); mapRef.current = null; };
    // El mapa se crea una vez por tema; los datos y capas se sincronizan en los efectos siguientes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const [id, value] of Object.entries(data)) map.getSource(id)?.setData(value);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyVisibility(map);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none');
  }, [satellite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedLot) return;
    const bounds = new LngLatBounds([selectedLot.longitude, selectedLot.latitude], [selectedLot.longitude, selectedLot.latitude]);
    const destinoPuerto = puertos.find((puerto) => puerto.id === destino);
    if (destinoPuerto) bounds.extend([destinoPuerto.longitude, destinoPuerto.latitude]);
    fleteros.slice(0, 12).forEach((oferta) => bounds.extend([oferta.base.lon, oferta.base.lat]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 10, duration: 700 });
    // Encuadra al cambiar de lote o de destino, no en cada actualización de datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLot?.id, destino]);

  return (
    <div className="cl-map">
      <div ref={containerRef} className="cl-map-canvas" />
      <button type="button" className="map-chip cl-map-toggle" onClick={() => setSatellite((value) => !value)}>
        {satellite ? 'Ver mapa' : 'Ver satélite'}
      </button>
      {error && <div className="map-message map-message--error" role="alert">{error}</div>}
    </div>
  );
}
