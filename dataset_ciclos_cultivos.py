"""
Dataset de duración siembra -> cosecha para soja, trigo, maíz y sorgo
en la provincia de Santa Fe (Argentina). Genera un Excel.

IMPORTANTE: los valores de la tabla CULTIVOS son ORIENTATIVOS (conocimiento
agronómico general de la región pampeana). Validalos y reemplazalos con
fuentes oficiales: INTA, Bolsa de Comercio de Rosario, Ministerio de
Agricultura de la Nación / Ministerio de Producción de Santa Fe.
Si descargás las "Estimaciones agrícolas" oficiales (CSV), guardalas como
estimaciones_agricolas.csv junto a este script y se agregan al Excel
filtradas por Santa Fe.

Es muy liviano: no descarga nada ni hace cálculos pesados.
Requisitos:  pip install pandas openpyxl
"""
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

# ---- Configuración ----------------------------------------------------------
ANIOS_SIEMBRA = [2025, 2026]     # años en que se siembra
PASO_DIAS = 7                    # cada cuántos días generar una fecha de siembra
OUTPUT = "ciclos_cultivos_santa_fe.xlsx"
OFICIAL_CSV = "estimaciones_agricolas.csv"   # opcional

# (mes, día) de inicio y fin de cada ventana; días de siembra a cosecha
CULTIVOS = [
    dict(cultivo="Soja", ciclo="1ra (siembra octubre-noviembre)",
         siembra_ini=(10, 15), siembra_fin=(11, 30),
         cosecha_ini=(4, 1), cosecha_fin=(5, 31),
         dias_min=150, dias_tipico=165, dias_max=190),
    dict(cultivo="Soja", ciclo="2da (después de trigo)",
         siembra_ini=(11, 25), siembra_fin=(1, 10),
         cosecha_ini=(4, 20), cosecha_fin=(6, 10),
         dias_min=125, dias_tipico=145, dias_max=165),
    dict(cultivo="Maíz", ciclo="Temprano",
         siembra_ini=(9, 15), siembra_fin=(10, 31),
         cosecha_ini=(2, 15), cosecha_fin=(4, 15),
         dias_min=145, dias_tipico=160, dias_max=180),
    dict(cultivo="Maíz", ciclo="Tardío",
         siembra_ini=(11, 25), siembra_fin=(1, 10),
         cosecha_ini=(5, 1), cosecha_fin=(7, 31),
         dias_min=150, dias_tipico=175, dias_max=205),
    dict(cultivo="Trigo", ciclo="Único",
         siembra_ini=(5, 25), siembra_fin=(7, 20),
         cosecha_ini=(11, 20), cosecha_fin=(12, 31),
         dias_min=150, dias_tipico=170, dias_max=190),
    dict(cultivo="Sorgo granífero", ciclo="Único",
         siembra_ini=(10, 20), siembra_fin=(1, 10),
         cosecha_ini=(3, 1), cosecha_fin=(5, 31),
         dias_min=115, dias_tipico=135, dias_max=155),
]
NOTA = ("Valores orientativos; validar con INTA / BCR / Ministerio de "
        "Agricultura antes de usarlos para decisiones.")


def fecha(anio, md):
    return date(anio, md[0], md[1])


def ventana(anio, ini, fin):
    """Fechas de inicio y fin; si el fin 'cae antes' que el inicio, es del año siguiente."""
    d_ini = fecha(anio, ini)
    d_fin = fecha(anio, fin)
    if d_fin < d_ini:
        d_fin = fecha(anio + 1, fin)
    return d_ini, d_fin


def construir_calendario():
    filas = []
    for c in CULTIVOS:
        for anio in ANIOS_SIEMBRA:
            s_ini, s_fin = ventana(anio, c["siembra_ini"], c["siembra_fin"])
            # la cosecha ocurre siempre después de la siembra
            c_ini = fecha(s_ini.year, c["cosecha_ini"])
            while c_ini <= s_ini:
                c_ini = fecha(c_ini.year + 1, c["cosecha_ini"])
            c_fin = fecha(c_ini.year, c["cosecha_fin"])
            if c_fin < c_ini:
                c_fin = fecha(c_ini.year + 1, c["cosecha_fin"])
            filas.append({
                "cultivo": c["cultivo"], "ciclo": c["ciclo"],
                "anio_siembra": anio,
                "siembra_inicio": s_ini, "siembra_fin": s_fin,
                "cosecha_inicio": c_ini, "cosecha_fin": c_fin,
                "dias_min": c["dias_min"], "dias_tipico": c["dias_tipico"],
                "dias_max": c["dias_max"], "nota": NOTA,
            })
    return pd.DataFrame(filas)


def construir_dias_a_cosecha():
    """Una fila por fecha de siembra posible, con cosecha estimada (min/típica/máx)."""
    filas = []
    for c in CULTIVOS:
        for anio in ANIOS_SIEMBRA:
            s_ini, s_fin = ventana(anio, c["siembra_ini"], c["siembra_fin"])
            d = s_ini
            while d <= s_fin:
                filas.append({
                    "cultivo": c["cultivo"], "ciclo": c["ciclo"],
                    "fecha_siembra": d,
                    "cosecha_temprana": d + timedelta(days=c["dias_min"]),
                    "cosecha_tipica": d + timedelta(days=c["dias_tipico"]),
                    "cosecha_tardia": d + timedelta(days=c["dias_max"]),
                    "dias_min": c["dias_min"],
                    "dias_tipico": c["dias_tipico"],
                    "dias_max": c["dias_max"],
                })
                d += timedelta(days=PASO_DIAS)
    return pd.DataFrame(filas)


def estimar_cosecha(cultivo, ciclo, fecha_siembra):
    """Devuelve (temprana, típica, tardía) para una fecha de siembra dada."""
    for c in CULTIVOS:
        if c["cultivo"] == cultivo and c["ciclo"].startswith(ciclo):
            return tuple(fecha_siembra + timedelta(days=c[k])
                         for k in ("dias_min", "dias_tipico", "dias_max"))
    raise ValueError(f"No encontré {cultivo} / {ciclo}")


def leer_oficial():
    """Si existe el CSV oficial, lo filtra por Santa Fe y cultivos de interés."""
    ruta = Path(OFICIAL_CSV)
    if not ruta.exists():
        return None
    try:
        df = pd.read_csv(ruta, encoding="utf-8")
    except UnicodeDecodeError:
        df = pd.read_csv(ruta, encoding="latin-1")
    col_prov = next((c for c in df.columns if "provincia" in c.lower()), None)
    col_cult = next((c for c in df.columns if "cultivo" in c.lower()), None)
    if col_prov:
        df = df[df[col_prov].astype(str).str.contains("santa fe", case=False, na=False)]
    if col_cult:
        df = df[df[col_cult].astype(str).str.contains(
            "soja|trigo|ma[ií]z|sorgo", case=False, na=False, regex=True)]
    return df


def main():
    calendario = construir_calendario()
    dias = construir_dias_a_cosecha()
    oficial = leer_oficial()

    fuentes = pd.DataFrame({
        "fuente": [
            "Ministerio de Agricultura de la Nación - Datos abiertos (Estimaciones agrícolas)",
            "Bolsa de Comercio de Rosario - Guía Estratégica para el Agro / informes de siembra y cosecha",
            "Bolsa de Cereales de Buenos Aires - Panorama Agrícola Semanal",
            "INTA - ciclos y fechas de siembra por cultivo y región",
            "FAO / USDA / GEOGLAM - calendarios agrícolas globales (nivel país)",
        ],
        "uso": [
            "Superficie, producción y rendimiento por departamento (no trae fechas)",
            "Avance de siembra y cosecha semanal, zona núcleo y norte de Santa Fe",
            "Avance semanal de siembra y cosecha por región",
            "Ciclos y recomendaciones de fecha de siembra",
            "Referencia de ventanas de siembra y cosecha",
        ],
        "estado": "Verificar URL y vigencia en cada sitio",
    })

    with pd.ExcelWriter(OUTPUT, engine="openpyxl") as xw:
        calendario.to_excel(xw, sheet_name="calendario", index=False)
        dias.to_excel(xw, sheet_name="dias_a_cosecha", index=False)
        if oficial is not None and len(oficial):
            oficial.to_excel(xw, sheet_name="oficial_santa_fe", index=False)
        fuentes.to_excel(xw, sheet_name="fuentes", index=False)

    print(f"Listo: {OUTPUT}")
    print(f"  calendario: {len(calendario)} filas | dias_a_cosecha: {len(dias)} filas")
    print("  hoja oficial:", "incluida" if oficial is not None and len(oficial)
          else f"no incluida (no se encontró {OFICIAL_CSV})")

    # Ejemplo de uso
    ejemplo = estimar_cosecha("Soja", "1ra", date(2026, 11, 10))
    print("\nEjemplo: soja 1ra sembrada el 2026-11-10 -> cosecha "
          f"temprana {ejemplo[0]}, típica {ejemplo[1]}, tardía {ejemplo[2]}")


if __name__ == "__main__":
    main()
