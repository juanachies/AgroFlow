import { useEffect, useMemo, useRef, useState } from 'react';
import { GeolocateControl, Map, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  Check, Eraser, Layers, MousePointerClick, PenLine, Plus, SquareDashedMousePointer, Undo2, X,
} from 'lucide-react';
import { areaHa, centroide, perimetroM, poligonoDesdeVertices, verticesDe } from '../lib/geo.js';

setWorkerUrl(workerUrl);

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const EMPTY = { type: 'FeatureCollection', features: [] };
const CENTER_ROSARIO = [-60.64, -32.95];
const COLORS = { lot: '#22c55e', lotSelected: '#15803d', draft: '#eab308', halo: '#ffffff' };

const UNAVAILABLE_LAYERS = [
  { title: 'Precipitación', note: 'Hay pronóstico puntual; no hay raster para cubrir el mapa.' },
  { title: 'Humedad del suelo', note: 'Modelo regional puntual, no una capa de campo.' },
  { title: 'Elevación y pendiente', note: 'Hay cotas puntuales; no hay DEM procesado.' },
  { title: 'Transitabilidad', note: 'No hay modelo calibrado por lote.' },
  { title: 'Vegetación (NDVI)', note: 'No hay índices satelitales procesados.' },
];

const fmt = (value, digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);

function pointsFor(lots, selectedId) {
  return {
    type: 'FeatureCollection',
    features: lots.map((lot) => ({
      type: 'Feature',
      properties: { lotId: lot.id, name: lot.name, selected: lot.id === selectedId },
      geometry: { type: 'Point', coordinates: [lot.longitude, lot.latitude] },
    })),
  };
}

function boundariesFor(lots, selectedId, hiddenId) {
  return {
    type: 'FeatureCollection',
    features: lots
      .filter((lot) => lot.boundary && lot.id !== hiddenId)
      .map((lot) => ({
        type: 'Feature',
        properties: { lotId: lot.id, name: lot.name, selected: lot.id === selectedId },
        geometry: lot.boundary.geometry,
      })),
  };
}

function draftFor(vertices, mode) {
  const features = [];
  if (vertices.length >= 3) {
    features.push({ type: 'Feature', properties: { kind: 'area' }, geometry: { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] } });
  }
  if (vertices.length >= 2) {
    const line = mode === 'draw' ? vertices : [...vertices, vertices[0]];
    features.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: line } });
  }
  vertices.forEach((coordinates, i) => {
    features.push({ type: 'Feature', properties: { kind: 'vertex', i, first: i === 0 }, geometry: { type: 'Point', coordinates } });
  });
  if (mode === 'edit' && vertices.length >= 3) {
    vertices.forEach((a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      features.push({ type: 'Feature', properties: { kind: 'mid', i }, geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] } });
    });
  }
  return { type: 'FeatureCollection', features };
}

function installLayers(map, data, satelliteVisible) {
  if (!map.getSource('satellite')) {
    map.addSource('satellite', {
      type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    });
  }
  const firstLayer = map.getStyle().layers?.find(({ type }) => type !== 'background')?.id;
  if (!map.getLayer('satellite-base')) {
    map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite', layout: { visibility: satelliteVisible ? 'visible' : 'none' } }, firstLayer);
  }
  for (const [id, value] of Object.entries(data)) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: value });
  }
  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  add({ id: 'boundaries-fill', type: 'fill', source: 'boundaries', paint: { 'fill-color': ['case', ['get', 'selected'], COLORS.lotSelected, COLORS.lot], 'fill-opacity': ['case', ['get', 'selected'], 0.28, 0.14] } });
  add({ id: 'boundaries-line', type: 'line', source: 'boundaries', paint: { 'line-color': ['case', ['get', 'selected'], COLORS.lotSelected, COLORS.lot], 'line-width': ['case', ['get', 'selected'], 3, 1.5] } });
  add({ id: 'lot-points', type: 'circle', source: 'lots', paint: { 'circle-radius': ['case', ['get', 'selected'], 8, 6], 'circle-color': ['case', ['get', 'selected'], COLORS.lotSelected, COLORS.lot], 'circle-stroke-width': 2.5, 'circle-stroke-color': COLORS.halo } });
  add({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': COLORS.draft, 'fill-opacity': 0.22 } });
  add({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': COLORS.draft, 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
  add({ id: 'draft-mid', type: 'circle', source: 'draft', filter: ['==', ['get', 'kind'], 'mid'], paint: { 'circle-radius': 4.5, 'circle-color': COLORS.halo, 'circle-opacity': 0.85, 'circle-stroke-width': 1.5, 'circle-stroke-color': COLORS.draft } });
  add({ id: 'draft-vertices', type: 'circle', source: 'draft', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': ['case', ['get', 'first'], 8, 6.5], 'circle-color': ['case', ['get', 'first'], COLORS.draft, COLORS.halo], 'circle-stroke-width': 2.5, 'circle-stroke-color': COLORS.draft } });
}

export default function MapView({ lots, selectedLot, onSelectLot, onSaveBoundary, onCreateFromDrawing, theme = 'light', compact = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const selectRef = useRef(onSelectLot);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [baseMap, setBaseMap] = useState('streets');
  const [showLayers, setShowLayers] = useState(false);
  const [mode, setMode] = useState('view'); // view | draw | edit
  const [vertices, setVertices] = useState([]);
  const [history, setHistory] = useState([]);
  const modeRef = useRef(mode);
  const verticesRef = useRef(vertices);
  const dragRef = useRef(null);
  const dataRef = useRef({});

  selectRef.current = onSelectLot;
  modeRef.current = mode;
  verticesRef.current = vertices;

  const editingId = mode !== 'view' ? selectedLot?.id : null;
  dataRef.current = {
    lots: pointsFor(lots, selectedLot?.id),
    boundaries: boundariesFor(lots, selectedLot?.id, editingId),
    draft: draftFor(vertices, mode),
  };

  const measure = useMemo(() => {
    if (vertices.length < 3) return null;
    const feature = poligonoDesdeVertices(vertices);
    return { ha: areaHa(feature.geometry), perimeterKm: perimetroM(vertices) / 1000 };
  }, [vertices]);

  function commit(next) {
    setHistory((h) => [...h.slice(-49), verticesRef.current]);
    setVertices(next);
  }

  // Inicialización del mapa y de los manejadores de dibujo (una sola vez).
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new Map({
      container: containerRef.current,
      style: STYLES[theme] ?? STYLES.light,
      center: selectedLot ? [selectedLot.longitude, selectedLot.latitude] : CENTER_ROSARIO,
      zoom: selectedLot ? 12 : 6,
      attributionControl: { compact: true },
      maxZoom: 19,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    if (!compact) map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

    map.on('style.load', () => {
      try {
        installLayers(map, dataRef.current, map.__satellite);
        setReady(true);
        setMapError('');
      } catch (error) {
        setMapError(error.message || 'No se pudo preparar el mapa.');
      }
    });
    map.on('error', (event) => {
      if (!map.isStyleLoaded()) setMapError(event.error?.message || 'No se pudo cargar la cartografía. Revisá tu conexión.');
    });

    const pick = (layer, point) => map.getLayer(layer) ? map.queryRenderedFeatures(point, { layers: [layer] }) : [];

    map.on('click', (event) => {
      const current = modeRef.current;
      const verts = verticesRef.current;
      if (current === 'view') {
        const hit = pick('lot-points', event.point)[0] ?? pick('boundaries-fill', event.point)[0];
        if (hit?.properties?.lotId) selectRef.current?.(hit.properties.lotId);
        return;
      }
      if (current === 'edit') {
        const mid = pick('draft-mid', event.point)[0];
        if (mid) {
          const i = mid.properties.i;
          const next = [...verts];
          next.splice(i + 1, 0, mid.geometry.coordinates);
          setHistory((h) => [...h, verts]);
          setVertices(next);
        }
        return;
      }
      const first = pick('draft-vertices', event.point).find((f) => f.properties.first);
      if (first && verts.length >= 3) {
        setMode('edit');
        return;
      }
      setHistory((h) => [...h, verts]);
      setVertices([...verts, [event.lngLat.lng, event.lngLat.lat]]);
    });

    map.on('dblclick', (event) => {
      if (modeRef.current === 'draw') {
        event.preventDefault();
        if (verticesRef.current.length >= 3) setMode('edit');
      }
    });

    map.on('contextmenu', 'draft-vertices', (event) => {
      if (modeRef.current === 'view') return;
      event.preventDefault();
      const i = event.features?.[0]?.properties?.i;
      const verts = verticesRef.current;
      if (i == null || verts.length <= 3) return;
      setHistory((h) => [...h, verts]);
      setVertices(verts.filter((_, index) => index !== i));
    });

    const startDrag = (event) => {
      if (modeRef.current !== 'edit') return;
      const i = event.features?.[0]?.properties?.i;
      if (i == null) return;
      event.preventDefault();
      dragRef.current = { i, before: verticesRef.current };
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    };
    const moveDrag = (event) => {
      if (!dragRef.current) return;
      const { i } = dragRef.current;
      setVertices((verts) => verts.map((v, index) => (index === i ? [event.lngLat.lng, event.lngLat.lat] : v)));
    };
    const endDrag = () => {
      if (!dragRef.current) return;
      const { before } = dragRef.current;
      dragRef.current = null;
      setHistory((h) => [...h, before]);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    };
    map.on('mousedown', 'draft-vertices', startDrag);
    map.on('touchstart', 'draft-vertices', startDrag);
    map.on('mousemove', moveDrag);
    map.on('touchmove', moveDrag);
    map.on('mouseup', endDrag);
    map.on('touchend', endDrag);

    for (const layer of ['lot-points', 'boundaries-fill', 'draft-vertices', 'draft-mid']) {
      map.on('mouseenter', layer, () => {
        if (dragRef.current) return;
        const m = modeRef.current;
        if (layer.startsWith('draft') ? m === 'edit' || layer === 'draft-vertices' : m === 'view') {
          map.getCanvas().style.cursor = layer === 'draft-vertices' && m === 'edit' ? 'grab' : 'pointer';
        }
      });
      map.on('mouseleave', layer, () => {
        if (!dragRef.current) map.getCanvas().style.cursor = modeRef.current === 'draw' ? 'crosshair' : '';
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Tema: cambia la cartografía base y reinstala las capas propias.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setReady(false);
    map.setStyle(STYLES[theme] ?? STYLES.light);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [id, value] of Object.entries(dataRef.current)) map.getSource(id)?.setData(value);
  }, [lots, selectedLot, vertices, mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.__satellite = baseMap === 'satellite';
    if (ready && map.getLayer('satellite-base')) {
      map.setLayoutProperty('satellite-base', 'visibility', baseMap === 'satellite' ? 'visible' : 'none');
    }
  }, [baseMap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === 'draw' ? 'crosshair' : '';
    if (mode === 'draw') map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedLot || mode !== 'view') return;
    const verts = selectedLot.boundary ? verticesDe(selectedLot.boundary) : [];
    if (verts.length) {
      const lons = verts.map(([lon]) => lon);
      const lats = verts.map(([, lat]) => lat);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: compact ? 40 : 90, duration: 650, maxZoom: 16 });
    } else {
      map.flyTo({ center: [selectedLot.longitude, selectedLot.latitude], zoom: 13, duration: 650 });
    }
  }, [selectedLot?.id, ready]);

  useEffect(() => {
    if (mode === 'view') return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') cancel();
      if (event.key === 'Enter' && verticesRef.current.length >= 3) setMode('edit');
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function startDraw() {
    setHistory([]);
    setVertices([]);
    setMode('draw');
    if (baseMap !== 'satellite') setBaseMap('satellite');
  }

  function startEdit() {
    setHistory([]);
    setVertices(verticesDe(selectedLot.boundary));
    setMode('edit');
  }

  function undo() {
    if (!history.length) return;
    setVertices(history.at(-1));
    setHistory(history.slice(0, -1));
  }

  function cancel() {
    setMode('view');
    setVertices([]);
    setHistory([]);
  }

  async function save(target) {
    const feature = poligonoDesdeVertices(vertices, { origen: 'dibujado en AgroFlow' });
    const info = { ha: measure.ha, center: centroide(vertices) };
    if (target === 'new') await onCreateFromDrawing?.(feature, info);
    else await onSaveBoundary?.(selectedLot, feature, info);
    cancel();
  }

  const declared = selectedLot?.areaHa;
  const diffPct = measure && declared ? ((measure.ha - declared) / declared) * 100 : null;
  const drawing = mode !== 'view';

  return (
    <section className={`map-card${compact ? ' map-card--compact' : ''}${drawing ? ' is-drawing' : ''}`} aria-label="Mapa de lotes">
      <div className="map-canvas" ref={containerRef} />
      <div className="map-heading">
        <div className="map-title glass">
          <span className="eyebrow">{lots.length ? `${lots.length} ${lots.length === 1 ? 'lote' : 'lotes'} georreferenciados` : 'Vista regional'}</span>
          <h2>{selectedLot?.name ?? 'Zona núcleo · Santa Fe'}</h2>
        </div>
        <div className="map-heading-actions">
          {!compact && (
            <button type="button" className={`map-chip glass${showLayers ? ' is-selected' : ''}`} onClick={() => setShowLayers((v) => !v)} aria-expanded={showLayers}>
              <Layers size={15} aria-hidden="true" /> Capas
            </button>
          )}
          <div className="segmented glass" role="group" aria-label="Mapa base">
            <button type="button" className={baseMap === 'streets' ? 'is-selected' : ''} aria-pressed={baseMap === 'streets'} onClick={() => setBaseMap('streets')}>Mapa</button>
            <button type="button" className={baseMap === 'satellite' ? 'is-selected' : ''} aria-pressed={baseMap === 'satellite'} onClick={() => setBaseMap('satellite')}>Satélite</button>
          </div>
        </div>
      </div>

      {!compact && showLayers && (
        <div className="map-layer-panel glass">
          <span className="eyebrow">Capas del lote · sin raster procesado</span>
          {UNAVAILABLE_LAYERS.map((layer) => (
            <div className="layer-option" key={layer.title} title={layer.note}>
              <span className="layer-toggle" aria-hidden="true" />
              <span><strong>{layer.title}</strong><small>{layer.note}</small></span>
            </div>
          ))}
        </div>
      )}

      {!compact && ready && (
        <div className="draw-toolbar glass" role="toolbar" aria-label="Herramientas de dibujo">
          {!drawing ? (
            <>
              <button type="button" className="tool-button tool-button--accent" onClick={startDraw}>
                <PenLine size={16} aria-hidden="true" /> Dibujar lote
              </button>
              {selectedLot?.boundary && (
                <button type="button" className="tool-button" onClick={startEdit}>
                  <SquareDashedMousePointer size={16} aria-hidden="true" /> Editar límite
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="tool-button" onClick={undo} disabled={!history.length} title="Deshacer (Ctrl+Z)">
                <Undo2 size={16} aria-hidden="true" /> Deshacer
              </button>
              <button type="button" className="tool-button" onClick={() => commit([])} disabled={!vertices.length}>
                <Eraser size={16} aria-hidden="true" /> Borrar
              </button>
              {mode === 'draw' && (
                <button type="button" className="tool-button" onClick={() => setMode('edit')} disabled={vertices.length < 3}>
                  <Check size={16} aria-hidden="true" /> Cerrar polígono
                </button>
              )}
              <button type="button" className="tool-button" onClick={cancel} title="Cancelar (Esc)">
                <X size={16} aria-hidden="true" /> Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {drawing && (
        <div className="measure-panel glass" aria-live="polite">
          <div className="measure-hint">
            <MousePointerClick size={15} aria-hidden="true" />
            {mode === 'draw'
              ? (vertices.length < 3 ? 'Hacé clic en el mapa para marcar cada esquina del lote.' : 'Clic en el primer punto, doble clic o Enter para cerrar.')
              : 'Arrastrá los vértices, clic en los puntos medios para agregar, clic derecho para quitar.'}
          </div>
          <div className="measure-value">
            <span>Superficie</span>
            <strong>{measure ? fmt(measure.ha, 2) : '—'}<small> ha</small></strong>
          </div>
          <div className="measure-grid">
            <div><span>Perímetro</span><strong>{measure ? `${fmt(measure.perimeterKm, 2)} km` : '—'}</strong></div>
            <div><span>Vértices</span><strong>{vertices.length}</strong></div>
            {diffPct !== null && (
              <div className="measure-wide"><span>vs. declarado ({fmt(declared)} ha)</span><strong className={Math.abs(diffPct) > 5 ? 'text-warning' : 'text-success'}>{diffPct > 0 ? '+' : ''}{fmt(diffPct)}%</strong></div>
            )}
          </div>
          {mode === 'edit' && measure && (
            <div className="measure-actions">
              {selectedLot && (
                <button type="button" className="button button--primary button--small" onClick={() => save('lot')}>
                  <Check size={15} aria-hidden="true" /> Guardar en {selectedLot.name.length > 18 ? 'el lote' : selectedLot.name}
                </button>
              )}
              {onCreateFromDrawing && (
                <button type="button" className={`button button--small ${selectedLot ? 'button--secondary' : 'button--primary'}`} onClick={() => save('new')}>
                  <Plus size={15} aria-hidden="true" /> Crear lote nuevo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!ready && !mapError && <div className="map-message" role="status">Conectando cartografía…</div>}
      {mapError && <div className="map-message map-message--error" role="status">Mapa no disponible · {mapError}</div>}
      {!lots.length && ready && !drawing && (
        <div className="map-empty-label glass"><span className="empty-dot" /> Sin lotes · dibujá uno o cargalo desde “Nuevo lote”</div>
      )}
      {selectedLot && !selectedLot.boundary && !drawing && ready && !compact && (
        <div className="map-point-label glass"><span className="empty-dot" /> Este lote solo tiene un punto · dibujá su límite para medir la superficie</div>
      )}
    </section>
  );
}
