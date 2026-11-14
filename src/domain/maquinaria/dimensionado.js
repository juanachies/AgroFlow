export function cantidadCosechadoras({ hectareas = 0, diasDisponibles = 1, haPorDiaPorCosechadora = 10 } = {}) {
  const capacidad = Math.max(haPorDiaPorCosechadora * diasDisponibles, 1);
  return Math.ceil(hectareas / capacidad);
}

export function dimensionarMaquinaria({
  hectareas = 0,
  diasDisponibles = 1,
  haPorDiaPorCosechadora = 10,
  tractoresPorCosechadora = 1,
  tolvasPorTractor = 1,
} = {}) {
  const cosechadoras = cantidadCosechadoras({ hectareas, diasDisponibles, haPorDiaPorCosechadora });
  return {
    hectareas,
    diasDisponibles,
    cosechadoras,
    tractores: cosechadoras * tractoresPorCosechadora,
    tolvas: cosechadoras * tractoresPorCosechadora * tolvasPorTractor,
  };
}

export default dimensionarMaquinaria;
