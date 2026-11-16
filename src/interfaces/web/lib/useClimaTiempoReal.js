import { useCallback, useEffect, useRef, useState } from 'react';

import { consultarClimaLotes } from './climaTiempoReal.js';

const INTERVALO_MS = 10 * 60 * 1000;

const tieneCoordenadas = (lote) => Number.isFinite(Number(lote?.latitude))
  && Number.isFinite(Number(lote?.longitude));

/** Clima actual de los lotes: consulta al montar y cada 10 minutos. */
export function useClimaTiempoReal(lotes) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const vivo = useRef(false);
  const lotesRef = useRef(lotes);
  lotesRef.current = lotes;

  const recargar = useCallback(async () => {
    const actuales = (lotesRef.current ?? []).filter(tieneCoordenadas);
    if (!actuales.length) {
      setDatos(null);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const resultado = await consultarClimaLotes(actuales);
      if (vivo.current) setDatos(resultado);
    } catch (fallo) {
      if (vivo.current) setError(fallo.message ?? 'No se pudo consultar el clima.');
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    recargar();
    const intervalo = setInterval(recargar, INTERVALO_MS);
    return () => {
      vivo.current = false;
      clearInterval(intervalo);
    };
  }, [recargar]);

  return { datos, cargando, error, recargar };
}
