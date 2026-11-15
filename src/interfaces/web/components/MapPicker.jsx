import { useEffect, useId, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { areaHa, centroide, poligonoDesdeVertices } from '../lib/geo.js';
import { searchArgentineCities } from '../lib/geocoding.js';

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

function featureCollection(boundary, vertices) {
  const features = [];
  if (boundary?.geometry?.type === 'Polygon' && vertices.length < 3) {
    features.push({ ...boundary, properties: { kind: 'saved' } });
  }
  if (vertices.length >= 3) {
    features.push({ ...poligonoDesdeVertices(vertices), properties: { kind: 'draft' } });
  }
  if (vertices.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: vertices },
    });
  }
  vertices.forEach((coordinates) => {
    features.push({ type: 'Feature', properties: { kind: 'vertex' }, geometry: { type: 'Point', coordinates } });
  });
  return { type: 'FeatureCollection', features };
}

export default function MapPicker({
  latitude,
  longitude,
  onPick,
  city = '',
  onCityChange,
  mode = 'point',
  boundary = null,
  onBoundaryChange,
}) {
  const containerRef = useRef(null);
  const cityInputId = useId();
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const pickRef = useRef(onPick);
  const boundaryRef = useRef(boundary);
  const verticesRef = useRef([]);
  const [satellite, setSatellite] = useState(true);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState([]);
  const [cityQuery, setCityQuery] = useState(city);
  const [vertices, setVertices] = useState([]);

  pickRef.current = onPick;
  boundaryRef.current = boundary;
  verticesRef.current = vertices;

  useEffect(() => {
    const initial = validPoint(latitude, longitude);
    const map = new Map({
      container: containerRef.current,
      style: STYLE,
      center: initial ?? CENTER_ROSARIO,
      zoom: initial ? 13 : 6,
      attributionControl: { compact: true },
      maxZoom: 19,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.getCanvas().style.cursor = mode === 'polygon' ? 'crosshair' : '';
    if (initial && mode === 'point') markerRef.current = new Marker({ color: MARKER_COLOR }).setLngLat(initial).addTo(map);

    map.on('load', () => {
      map.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
      map.addSource('field-boundary', { type: 'geojson', data: featureCollection(boundaryRef.current, verticesRef.current) });
      map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite' });
      map.addLayer({ id: 'field-fill', type: 'fill', source: 'field-boundary', filter: ['==', ['get', 'kind'], 'saved'], paint: { 'fill-color': '#15803d', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'draft-fill', type: 'fill', source: 'field-boundary', filter: ['==', ['get', 'kind'], 'draft'], paint: { 'fill-color': '#eab308', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'field-line', type: 'line', source: 'field-boundary', filter: ['in', ['get', 'kind'], ['literal', ['saved', 'draft', 'line']]], paint: { 'line-color': ['case', ['==', ['get', 'kind'], 'saved'], '#15803d', '#eab308'], 'line-width': 2.5 } });
      map.addLayer({ id: 'field-vertices', type: 'circle', source: 'field-boundary', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#eab308' } });
    });
    map.on('error', (event) => {
      if (!map.isStyleLoaded()) setError(event.error?.message || 'No se pudo cargar el mapa. Revisá tu conexión.');
    });
    map.on('click', ({ lngLat }) => {
      if (mode === 'polygon') {
        if (verticesRef.current.length >= 500) {
          setError('El perímetro admite hasta 500 vértices.');
          return;
        }
        setError('');
        const next = [...verticesRef.current, [lngLat.lng, lngLat.lat]];
        verticesRef.current = next;
        setVertices(next);
        const point = centroide(next);
        pickRef.current?.(point[1], point[0]);
        if (next.length >= 3) onBoundaryChange?.(poligonoDesdeVertices(next, { areaHa: areaHa(poligonoDesdeVertices(next).geometry) }));
        else onBoundaryChange?.(null);
      } else {
        pickRef.current?.(lngLat.lat, lngLat.lng);
      }
    });

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // The map is initialized once; state changes are synchronized by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const point = validPoint(latitude, longitude);
    if (!map || !point || mode !== 'point') return;
    if (markerRef.current) markerRef.current.setLngLat(point);
    else markerRef.current = new Marker({ color: MARKER_COLOR }).setLngLat(point).addTo(map);
  }, [latitude, longitude, mode]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('field-boundary');
    if (source && 'setData' in source) source.setData(featureCollection(boundary, vertices));
  }, [boundary, vertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
  }, [satellite]);

  async function searchCity() {
    setError('');
    setPlaces([]);
    setSearching(true);
    try {
      const results = await searchArgentineCities(cityQuery);
      setPlaces(results);
    } catch (reason) {
      setError(reason.message || 'No se pudo buscar esa ciudad.');
    } finally {
      setSearching(false);
    }
  }

  function choosePlace(place) {
    if (mode === 'polygon' && place.label !== city) onBoundaryChange?.(null);
    onCityChange?.(place.label);
    setCityQuery(place.label);
    setPlaces([]);
    setError('');
    mapRef.current?.flyTo({ center: [place.longitude, place.latitude], zoom: 11, duration: 700 });
    if (mode === 'point') onPick?.(place.latitude, place.longitude);
  }

  function undoVertex() {
    const next = verticesRef.current.slice(0, -1);
    verticesRef.current = next;
    setVertices(next);
    const point = next.length ? centroide(next) : null;
    if (point) onPick?.(point[1], point[0]);
    onBoundaryChange?.(next.length >= 3 ? poligonoDesdeVertices(next, { areaHa: areaHa(poligonoDesdeVertices(next).geometry) }) : null);
  }

  function clearBoundary() {
    verticesRef.current = [];
    setVertices([]);
    onBoundaryChange?.(null);
  }

  return (
    <div className="map-picker">
      {onCityChange && (
        <div className="map-picker-search" role="search">
          <label className="visually-hidden" htmlFor={cityInputId}>Buscar ciudad o localidad argentina</label>
          <input
            id={cityInputId}
            value={cityQuery}
            disabled={searching}
            onChange={(event) => {
              setCityQuery(event.target.value);
              onCityChange?.('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                searchCity();
              }
            }}
            required
            maxLength={100}
            placeholder="Buscar ciudad o localidad"
          />
          <button type="button" className="button button--secondary button--small" onClick={searchCity} disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
          {places.length > 0 && (
            <div className="map-picker-results" role="listbox" aria-label="Resultados de ciudades">
              {places.map((place) => (
                <button key={`${place.longitude}-${place.latitude}`} type="button" role="option" onClick={() => choosePlace(place)}>{place.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} className="map-picker-canvas" />
      <button type="button" className="map-chip map-picker-toggle" onClick={() => setSatellite((value) => !value)}>
        {satellite ? 'Ver mapa' : 'Ver satélite'}
      </button>
      {mode === 'polygon' && (
        <div className="map-picker-draw-tools">
          <button type="button" className="button button--secondary button--small" onClick={undoVertex} disabled={!vertices.length}>Deshacer punto</button>
          <button type="button" className="button button--secondary button--small" onClick={clearBoundary} disabled={!boundary && !vertices.length}>Borrar perímetro</button>
          <span>{boundary ? `Perímetro actual · ${areaHa(boundary.geometry).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha` : `${vertices.length} puntos · marcá al menos 3`}</span>
        </div>
      )}
      {error && <div className="map-message map-message--error" role="alert">{error}</div>}
      <p className="map-picker-attribution">Búsqueda: Photon · Datos © OpenStreetMap | Mapa: OpenFreeMap y Esri</p>
    </div>
  );
}
