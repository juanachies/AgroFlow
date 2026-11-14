import { exigirClave } from '../shared/errores.js';

export function costoCosechaUsdPorHa(cultivo, qqHa, tarifas) {
  exigirClave('cultivo', cultivo, tarifas.cosecha.factor_vs_soja);
  const c = tarifas.cosecha;
  const pendiente = (c.usd_ha_rinde_alto - c.usd_ha_rinde_base) / (c.rinde_alto_qq_ha - c.rinde_base_qq_ha);
  const usdHa = c.usd_ha_rinde_base + Math.max(0, qqHa - c.rinde_base_qq_ha) * pendiente;
  return usdHa * c.factor_vs_soja[cultivo];
}
