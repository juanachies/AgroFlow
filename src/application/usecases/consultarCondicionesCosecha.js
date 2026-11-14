function toSourceFailure(source, reason) {
  return {
    source,
    message: reason instanceof Error ? reason.message : String(reason),
  };
}

function dailyForecastIndicators(weather) {
  const { daily = {}, hourly = {} } = weather;
  const dates = daily.time ?? [];
  return dates.map((date, index) => {
    const hourlyIndexes = (hourly.time ?? [])
      .map((time, hourIndex) => ({ time, hourIndex }))
      .filter(({ time }) => time.slice(0, 10) === date)
      .map(({ hourIndex }) => hourIndex);
    const rainProbabilities = hourlyIndexes
      .map((hourIndex) => hourly.precipitation_probability?.[hourIndex])
      .filter((value) => Number.isFinite(value));
    const soilValues = Object.fromEntries(
      Object.entries(hourly)
        .filter(([name]) => name.startsWith('soil_moisture_'))
        .map(([name, values]) => [
          name,
          hourlyIndexes.map((hourIndex) => values?.[hourIndex]).filter(Number.isFinite),
        ]),
    );

    return {
      date,
      precipitationMm: daily.precipitation_sum?.[index] ?? null,
      precipitationHours: daily.precipitation_hours?.[index] ?? null,
      precipitationProbabilityMaxPercent: rainProbabilities.length
        ? Math.max(...rainProbabilities)
        : daily.precipitation_probability_max?.[index] ?? null,
      temperatureMinC: daily.temperature_2m_min?.[index] ?? null,
      temperatureMaxC: daily.temperature_2m_max?.[index] ?? null,
      referenceEvapotranspirationMm: daily.et0_fao_evapotranspiration?.[index] ?? null,
      soilMoistureHourly: soilValues,
      soilMoistureInterpretation: 'Indicador modelado regional; no es una medición de capacidad portante.',
      source: 'Open-Meteo',
      type: 'forecast',
    };
  });
}

export async function consultarCondicionesCosecha({
  lote,
  startDate,
  endDate,
  historyStartDate,
  historyEndDate,
  incluirIMERG = false,
  incluirSMAP = false,
  incluirSentinel = false,
  imergStartDate,
  imergEndDate,
  adapters = {},
} = {}) {
  if (!lote || !Number.isFinite(Number(lote.latitude)) || !Number.isFinite(Number(lote.longitude))) {
    throw new TypeError('lote.latitude y lote.longitude son obligatorios');
  }
  if (!adapters.openMeteo?.obtenerPronostico) {
    throw new TypeError('Se requiere el adaptador Open-Meteo para consultar el pronóstico');
  }
  if (incluirIMERG && (!imergStartDate || !imergEndDate)) {
    throw new TypeError('IMERG requiere imergStartDate e imergEndDate (máximo 3 días por consulta)');
  }
  if ((incluirSMAP || incluirSentinel) && (!historyStartDate || !historyEndDate)) {
    throw new TypeError('SMAP y Sentinel requieren historyStartDate y historyEndDate');
  }

  const coordinates = {
    latitude: Number(lote.latitude),
    longitude: Number(lote.longitude),
  };
  const forecast = await adapters.openMeteo.obtenerPronostico({
    ...coordinates,
    startDate,
    endDate,
  });

  const optionalRequests = [];
  if (historyStartDate && historyEndDate && adapters.nasaPower?.obtenerHistorial) {
    optionalRequests.push({
      source: 'NASA POWER',
      request: adapters.nasaPower.obtenerHistorial({
        ...coordinates,
        start: historyStartDate,
        end: historyEndDate,
      }),
    });
  }
  if (incluirIMERG && adapters.imerg?.lluviaEnPunto) {
    optionalRequests.push({
      source: 'NASA GPM IMERG',
      request: adapters.imerg.lluviaEnPunto({
        ...coordinates,
        start: imergStartDate,
        end: imergEndDate,
      }),
    });
  }
  if (adapters.smn?.obtenerPronostico) {
    optionalRequests.push({
      source: 'SMN',
      request: adapters.smn.obtenerPronostico(coordinates),
    });
  }
  if (historyStartDate && historyEndDate && adapters.smn?.historialPrecipitacion) {
    optionalRequests.push({
      source: 'SMN precipitación observada',
      request: adapters.smn.historialPrecipitacion({
        ...coordinates,
        start: `${historyStartDate}T00:00`,
        end: `${historyEndDate}T23:00`,
      }),
    });
  }
  if (adapters.smn?.obtenerAlertas) {
    optionalRequests.push({
      source: 'SMN alertas',
      request: adapters.smn.obtenerAlertas(coordinates),
    });
  }
  if (adapters.elevacion?.elevacion) {
    optionalRequests.push({
      source: 'Open-Meteo Elevation',
      request: adapters.elevacion.elevacion(coordinates),
    });
  }
  if (incluirSMAP && adapters.smap?.buscarGranulos) {
    optionalRequests.push({
      source: 'NASA SMAP',
      request: adapters.smap.buscarGranulos({
        ...coordinates,
        start: historyStartDate,
        end: historyEndDate,
      }),
    });
  }
  if (incluirSentinel && adapters.sentinel?.buscarProductos) {
    const bbox = [
      Math.max(-180, coordinates.longitude - 0.02),
      Math.max(-90, coordinates.latitude - 0.02),
      Math.min(180, coordinates.longitude + 0.02),
      Math.min(90, coordinates.latitude + 0.02),
    ];
    for (const collection of ['sentinel-1-grd', 'sentinel-2-l2a']) {
      optionalRequests.push({
        source: `Copernicus ${collection}`,
        request: adapters.sentinel.buscarProductos({
          collection,
          bbox,
          start: historyStartDate,
          end: historyEndDate,
          limit: 10,
        }),
      });
    }
  }

  const settled = await Promise.allSettled(optionalRequests.map(({ request }) => request));
  const sources = {
    openMeteo: forecast,
  };
  const successfulSources = ['Open-Meteo'];
  const sourceFailures = [];
  settled.forEach((result, index) => {
    const source = optionalRequests[index].source;
    if (result.status === 'fulfilled') {
      sources[source] = result.value;
      successfulSources.push(source);
    } else {
      sourceFailures.push(toSourceFailure(source, result.reason));
    }
  });

  const notRequested = [];
  if (!historyStartDate || !historyEndDate) notRequested.push('NASA POWER: no historical date range provided');
  if (!incluirIMERG) notRequested.push('NASA GPM IMERG: disabled by default');
  if (!adapters.smn) notRequested.push('SMN: production base URL not configured');
  if (!incluirSMAP) notRequested.push('NASA SMAP: granule search not requested');
  if (!incluirSentinel) notRequested.push('Sentinel-1/2: product search not requested');
  notRequested.push('ERA5-Land, OpenTopography and Sentinel/SMAP raster values are not part of this daily indicator yet');

  return {
    lote: { ...lote, ...coordinates },
    queriedAt: new Date().toISOString(),
    timezone: forecast.timezone ?? 'America/Argentina/Buenos_Aires',
    sourceStatus: {
      required: ['Open-Meteo'],
      requested: ['Open-Meteo', ...optionalRequests.map(({ source }) => source)],
      successful: successfulSources,
      failed: sourceFailures,
      notRequested,
      quality: sourceFailures.length ? 'partial' : 'requested_sources_available',
      sourcesUsed: Object.keys(sources).length,
    },
    dailyForecast: dailyForecastIndicators(forecast),
    sources,
    limitations: [
      'La humedad de suelo modelada no equivale a una medición del lote ni a capacidad portante.',
      'El pronóstico no debe interpretarse como certeza; su detalle y confiabilidad dependen del horizonte.',
      'No se calculó un porcentaje de transitabilidad por falta de mediciones locales para calibrarlo.',
    ],
  };
}

export default consultarCondicionesCosecha;
