export function colaBuques({
  buquesEsperando = 0,
  capacidadTerminal = 0,
  toneladas = 0,
  demoraHoras = 0,
} = {}) {
  return {
    buquesEsperando,
    capacidadTerminal,
    toneladas,
    demoraHoras,
    riesgoCola: buquesEsperando > 0 || demoraHoras > 0,
  };
}

export default colaBuques;
