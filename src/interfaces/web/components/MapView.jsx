import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

const BASE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };
const CENTER_ROSARIO = [-60.64, -32.95];

const UNAVAILABLE_LAYERS = [
  { title: 'Precipitación', note: 'Hay pronóstico puntual; no hay raster para cubrir el mapa.' },
  { title: 'Humedad del suelo', note: 'Modelo regional puntual, no una capa de campo.' },
  { title: 'Elevación y pendiente', note: 'Hay cotas puntuales; no hay DEM procesado.' },
  { title: 'Transitabilidad', note: 'No hay modelo calibrado por lote.' },
  { title: 'Vegetación', note: 'No hay índices satelitales procesados.' },
];

function collectionForLots(lots, selectedLotId) {
  return {
    type: 'FeatureCollection',
    features: lots.map((lot) => ({
      type: 'Feature',
      properties: { lotId: lot.id, name: lot.name, selected: lot.id === selectedLotId },
      geometry: { type: 'Point', coordinates: [lot.longitude, lot.latitude] },
    })),
  };
}

export default function MapView({ lots, selectedLot, onSelectLot, compact = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const selectRef = useRef(onSelectLot);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [baseMap, setBaseMap] = useState('streets');

  selectRef.current = onSelectLot;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: selectedLot ? [selectedLot.longitude, selectedLot.latitude] : CENTER_ROSARIO,
      zoom: selectedLot ? 11 : 6,
      attributionControl: { compact: true },
      maxZoom: 18,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      try {
        map.addSource('satellite', {
          type: 'raster',
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        });
        const firstLayer = map.getStyle().layers?.find(({ type }) => type !== 'background')?.id;
        map.addLayer({
          id: 'satellite-base',
          type: 'raster',
          source: 'satellite',
          layout: { visibility: baseMap === 'satellite' ? 'visible' : 'none' },
        }, firstLayer);
        map.addSource('lots', { type: 'geojson', data: collectionForLots(lots, selectedLot?.id) });
        map.addLayer({
          id: 'lot-points',
          type: 'circle',
          source: 'lots',
          paint: {
            'circle-radius': ['case', ['get', 'selected'], 8, 6],
            'circle-color': ['case', ['get', 'selected'], '#244b3a', '#72977c'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.addSource('selected-boundary', { type: 'geojson', data: EMPTY_COLLECTION });
        map.addLayer({
          id: 'selected-boundary-fill',
          type: 'fill',
          source: 'selected-boundary',
          paint: { 'fill-color': '#8fb39a', 'fill-opacity': 0.24 },
        });
        map.addLayer({
          id: 'selected-boundary-line',
          type: 'line',
          source: 'selected-boundary',
          paint: { 'line-color': '#244b3a', 'line-width': 2.5 },
        });
        map.on('click', 'lot-points', (event) => {
          const lotId = event.features?.[0]?.properties?.lotId;
          if (lotId) selectRef.current?.(lotId);
        });
        map.on('mouseenter', 'lot-points', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'lot-points', () => {
          map.getCanvas().style.cursor = '';
        });
        setReady(true);
        setMapError('');
      } catch (error) {
        setMapError(error.message || 'No se pudo preparar el mapa.');
      }
    });
    map.on('error', (event) => {
      if (!map.isStyleLoaded()) {
        setMapError(event.error?.message || 'No se pudo cargar la cartografía. Revisá tu conexión.');
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('lots')?.setData(collectionForLots(lots, selectedLot?.id));
    map.getSource('selected-boundary')?.setData(
      selectedLot?.boundary
        ? {
          type: 'FeatureCollection',
          features: [{
            ...selectedLot.boundary,
            properties: { ...selectedLot.boundary.properties, lotId: selectedLot.id },
          }],
        }
        : EMPTY_COLLECTION,
    );
  }, [lots, selectedLot, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedLot) return;
    map.flyTo({
      center: [selectedLot.longitude, selectedLot.latitude],
      zoom: selectedLot.boundary ? 13 : 11,
      duration: 650,
    });
  }, [selectedLot?.id, ready]);

  useEffect(() => {
    const layer = mapRef.current?.getLayer('satellite-base');
    if (layer) {
      mapRef.current.setLayoutProperty('satellite-base', 'visibility', baseMap === 'satellite' ? 'visible' : 'none');
    }
  }, [baseMap, ready]);

  return (
    <section className={`map-card${compact ? ' map-card--compact' : ''}`} aria-label="Mapa de lotes">
      <div className="map-canvas" ref={containerRef} />
      <div className="map-heading">
        <div>
          <span className="eyebrow">{lots.length ? `${lots.length} ${lots.length === 1 ? 'lote' : 'lotes'} georreferenciados` : 'Vista regional'}</span>
          <h2>{selectedLot?.name ?? 'Zona núcleo · Santa Fe'}</h2>
        </div>
        <div className="map-basemap-switch" role="group" aria-label="Mapa base">
          <button
            type="button"
            className={baseMap === 'streets' ? 'is-selected' : ''}
            aria-pressed={baseMap === 'streets'}
            onClick={() => setBaseMap('streets')}
          >
            Calles
          </button>
          <button
            type="button"
            className={baseMap === 'satellite' ? 'is-selected' : ''}
            aria-pressed={baseMap === 'satellite'}
            onClick={() => setBaseMap('satellite')}
          >
            Satélite
          </button>
        </div>
      </div>

      <div className="map-layer-panel">
        <span className="eyebrow">Capas del lote</span>
        {UNAVAILABLE_LAYERS.map((layer) => (
          <div className="layer-option" key={layer.title} title={layer.note}>
            <span className="layer-toggle" aria-hidden="true" />
            <span>
              <strong>{layer.title}</strong>
              <small>Sin capa espacial</small>
            </span>
            <span className="layer-info" aria-label={layer.note}>i</span>
          </div>
        ))}
        <button className="layer-option layer-option--disabled" type="button" disabled title="No hay un DEM raster disponible para modelar relieve 3D.">
          <span className="layer-toggle" aria-hidden="true" />
          <span><strong>Relieve 3D</strong><small>Requiere DEM</small></span>
          <span className="layer-info" aria-hidden="true">i</span>
        </button>
      </div>

      {!ready && !mapError && <div className="map-message" role="status">Conectando cartografía…</div>}
      {mapError && <div className="map-message map-message--error" role="status">Mapa no disponible · {mapError}</div>}
      {!lots.length && ready && (
        <div className="map-empty-label">
          <span className="empty-dot" />
          Sin lotes cargados · no se muestran límites ficticios
        </div>
      )}
      {selectedLot && !selectedLot.boundary && (
        <div className="map-point-label">
          <span className="empty-dot" />
          Punto del lote · falta importar su polígono
        </div>
      )}
      {!compact && (
        <div className="map-data-note">
          Base: OpenFreeMap / OpenStreetMap · Imágenes: Esri
        </div>
      )}
    </section>
  );
}
