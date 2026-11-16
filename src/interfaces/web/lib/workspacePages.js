import {
  CalendarRange, ChartNoAxesCombined, CloudSun, Compass, House, LayoutDashboard, Map as MapIcon, Package, Route, Store, Truck, UserRound,
} from 'lucide-react';

const PRODUCER_PAGES = [
  { id: 'summary', label: 'Resumen', icon: House, group: 'campo' },
  { id: 'estrategias', label: 'Estrategia y decisiones', icon: Compass, group: 'campo' },
  { id: 'centro', label: 'Centro logístico', icon: LayoutDashboard, group: 'campo' },
  { id: 'lots', label: 'Lotes y mapa', icon: MapIcon, group: 'campo' },
  { id: 'clima', label: 'Clima en vivo', icon: CloudSun, group: 'campo' },
  { id: 'planning', label: 'Planificación', icon: CalendarRange, group: 'campo' },
  { id: 'technical', label: 'Análisis técnico', icon: ChartNoAxesCombined, group: 'campo' },
  { id: 'silobolsas', label: 'Silobolsas', icon: Package, group: 'campo' },
  { id: 'despacho', label: 'Plan y despacho', icon: Route, group: 'campo' },
  { id: 'marketplace', label: 'Marketplace', icon: Store, group: 'marketplace' },
  { id: 'account', label: 'Cuenta', icon: UserRound, group: 'cuenta' },
];

const PROVIDER_PAGES = [
  { id: 'services', label: 'Mi servicio', icon: Truck, group: 'servicios' },
  { id: 'marketplace', label: 'Marketplace', icon: Store, group: 'marketplace' },
  { id: 'account', label: 'Cuenta', icon: UserRound, group: 'cuenta' },
];

const EMPTY_PAGES = [];

export function getWorkspacePages(role) {
  if (role === 'productor') return PRODUCER_PAGES;
  if (role === 'prestador') return PROVIDER_PAGES;
  return EMPTY_PAGES;
}

export function getHomePageForRole(role) {
  if (role === 'productor') return 'summary';
  if (role === 'prestador') return 'services';
  return null;
}
