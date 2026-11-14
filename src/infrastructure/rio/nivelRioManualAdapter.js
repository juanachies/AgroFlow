// Adaptador manual de NivelRioPort: el usuario carga la altura del Paraná en Rosario (m),
// por ejemplo leída del reporte diario del INA. null = sin dato (el índice no se evalúa).
export function crearNivelRioManualAdapter(alturaM = null) {
  return {
    async nivel() {
      return alturaM == null ? null : Number(alturaM);
    },
  };
}
