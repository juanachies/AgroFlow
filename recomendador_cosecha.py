"""
Recomendador de fecha de cosecha con datos de NASA POWER.

Dado un cultivo (soja, maíz, trigo, sorgo), una fecha de siembra y la
ubicación de tu lote, el script:

  1) Descarga el histórico diario de NASA POWER para UN punto (1 solo pedido
     por bloques, se guarda en caché).
  2) Estima la fecha de MADUREZ con tiempo térmico (grados-día acumulados),
     usando los años históricos como escenarios -> banda p10 / p50 / p90.
     Si ya sembraste, usa los datos reales hasta hoy y completa con el clima.
  3) Define la VENTANA DE COSECHA (madurez + secado a campo) y puntúa cada
     día con la probabilidad de que sea APTO según tus reglas:
        - sin lluvia en los N días previos       (DIAS_SECOS_PREVIOS = 5)
        - sin lluvia en los M días posteriores   (DIAS_SECOS_POSTERIORES = 2)
        - humedad del suelo <= umbral            (UMBRAL_SUELO)
  4) Para días cercanos (<= 10 días del último dato) usa un modelo de
     pronóstico (cuantiles para humedad, clasificador para lluvia) con
     TODAS las variables de POWER. Más lejos, un pronóstico no tiene
     habilidad real: usa la CLIMATOLOGÍA histórica de esos días.
     A medida que se acerca la cosecha, volvé a correr el script.

Requisitos:  pip install requests pandas openpyxl scikit-learn matplotlib
Uso:         python recomendador_cosecha.py
             python recomendador_cosecha.py --cultivo Maíz --siembra 2026-10-05 --lat -31.5 --lon -60.9

Los parámetros agronómicos (grados-día, secado) son ORIENTATIVOS: validalos
con INTA / tu asesor. Los resultados son una ayuda a la decisión, no una
garantía.
"""
import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests
from sklearn.ensemble import (HistGradientBoostingClassifier,
                              HistGradientBoostingRegressor)
from sklearn.metrics import brier_score_loss

# =============================== CONFIGURACIÓN ===============================
LAT, LON = -31.63, -60.70          # Santa Fe capital: poné las coordenadas de tu lote
CULTIVO = "Trigo"                   # Soja, Maíz, Trigo o Sorgo
FECHA_SIEMBRA = "2026-11-10"       # AAAA-MM-DD (puede ser pasada o futura)
ANIO_INICIO_HISTORIA = 2025        # más historia = mejores probabilidades

# --- Reglas de lluvia (tu criterio de "días antes / después") ---
DIAS_SECOS_PREVIOS = 5             # días sin lluvia ANTES de cosechar
DIAS_SECOS_POSTERIORES = 2         # días sin lluvia DESPUÉS (terminar antes de que llueva)
LLUVIA_MM = 1.0                    # mm/día desde los que cuenta como día de lluvia
UMBRAL_SUELO = 0.60                # humedad superficial GWETTOP (0-1) máxima para entrar

# --- Clasificación y elección ---
P_RECOMENDADO = 0.60               # prob. de día apto para "RECOMENDADO"
P_POSIBLE = 0.35                   # prob. de día apto para "POSIBLE"
PEN_DEMORA = 0.004                 # penalización por día de espera (0 = ninguna)
MARGEN_DIAS = 21                   # días extra al final de la ventana de cosecha
VENTANA_MIN = 2                    # días consecutivos mínimos para reportar un rango
SUAVIZADO_DIAS = 3                 # ±días para suavizar la climatología

# --- Pronóstico de corto plazo ---
PRONOSTICO_CORTO = "auto"          # "auto", True o False
HORIZONTE_CORTO = 10               # días
ANIOS_ENTRENAMIENTO = 10           # años de historia para entrenar (más liviano)
VERIFICAR = True                   # imprime qué tan bueno es el modelo corto

# --- Parámetros agronómicos ORIENTATIVOS ---
# tbase/tcap: temperaturas base y techo para grados-día (°C)
# gdd: grados-día de siembra a madurez fisiológica
# secado: (mín, máx) días desde madurez hasta cosecha con grano en condición
CULTIVOS = {
    "soja":  dict(nombre="Soja",  tbase=10, tcap=30, gdd=2000, secado=(10, 25)),
    "maiz":  dict(nombre="Maíz",  tbase=10, tcap=30, gdd=1700, secado=(20, 40)),
    "trigo": dict(nombre="Trigo", tbase=0,  tcap=30, gdd=2200, secado=(7, 20)),
    "sorgo": dict(nombre="Sorgo", tbase=10, tcap=35, gdd=1800, secado=(15, 35)),
}

# Variables de NASA POWER (comunidad AG). Podés agregar otras disponibles,
# por ejemplo "GWETPROF", "EVPTRNS" o "T2MDEW" (verificá que la API las acepte).
PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETTOP", "GWETROOT",
          "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PS"]
URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
CUANT = (0.10, 0.50, 0.90)
# =============================================================================


# ------------------------------- 1. DATOS ------------------------------------
def descargar(lat, lon):
    """Histórico diario de un punto. Usa caché de 1 día."""
    ruta = Path(f"cache_power_{lat}_{lon}.csv")
    if ruta.exists() and time.time() - ruta.stat().st_mtime < 86400:
        return pd.read_csv(ruta, parse_dates=["fecha"], index_col="fecha")

    fin = date.today() - timedelta(days=5)      # POWER publica con unos días de demora
    trozos = []
    try:
        for a in range(ANIO_INICIO_HISTORIA, fin.year + 1, 5):
            f_ini = date(a, 1, 1)
            f_fin = min(date(a + 4, 12, 31), fin)
            if f_ini > f_fin:
                continue
            print(f"  descargando {f_ini} -> {f_fin} ...")
            q = {"parameters": ",".join(PARAMS), "community": "AG",
                 "latitude": lat, "longitude": lon, "format": "JSON",
                 "start": f_ini.strftime("%Y%m%d"), "end": f_fin.strftime("%Y%m%d")}
            for intento in range(3):
                try:
                    r = requests.get(URL, params=q, timeout=120)
                    r.raise_for_status()
                    break
                except Exception as e:
                    print(f"   reintento {intento + 1}: {e}")
                    time.sleep(3 * (intento + 1))
            else:
                raise RuntimeError("la API no respondió")
            d = pd.DataFrame(r.json()["properties"]["parameter"])
            d.index = pd.to_datetime(d.index, format="%Y%m%d")
            trozos.append(d)
            time.sleep(0.5)
        df = pd.concat(trozos).replace(-999, np.nan)
        df.index.name = "fecha"
        df.to_csv(ruta)
        return df
    except Exception as e:
        if ruta.exists():
            print(f"AVISO: no se pudo descargar ({e}). Uso la caché antigua.")
            return pd.read_csv(ruta, parse_dates=["fecha"], index_col="fecha")
        sys.exit(f"No se pudo descargar datos de NASA POWER: {e}")


def preparar(df):
    df = df.sort_index().asfreq("D")
    df = df.interpolate(limit=5, limit_direction="both")
    faltan = [c for c in ("T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETTOP")
              if c not in df.columns]
    if faltan:
        sys.exit(f"Faltan columnas {faltan}. Borrá la caché (cache_power_*.csv).")
    return df


# ------------------------------ 2. MADUREZ -----------------------------------
def grados_dia(df, c):
    tmax = df["T2M_MAX"].clip(upper=c["tcap"])
    tmin = df["T2M_MIN"].clip(lower=c["tbase"])
    return (((tmax + tmin) / 2) - c["tbase"]).clip(lower=0).fillna(0.0)


def simular_madurez(gdd, siembra, gdd_obj):
    """Fechas de madurez, una por año histórico (escenario)."""
    idx, cum = gdd.index, gdd.cumsum()
    ultimo = idx[-1]
    if siembra < idx[0] + pd.Timedelta(days=1):
        sys.exit("La fecha de siembra es anterior al inicio de los datos.")

    if siembra <= ultimo:                       # ya sembrado: hay datos reales
        pos_s = idx.searchsorted(siembra)
        base0 = cum.iloc[pos_s - 1]
        obs = cum.iloc[-1] - base0
        if obs >= gdd_obj:                      # ya alcanzó la madurez
            pos = np.searchsorted(cum.values, base0 + gdd_obj)
            return pd.Series({siembra.year: idx[pos]}), obs
        falta, inicio = gdd_obj - obs, ultimo + pd.Timedelta(days=1)
    else:
        obs, falta, inicio = 0.0, gdd_obj, siembra

    out = {}
    for anio in range(idx[0].year, ultimo.year + 1):
        shift = anio - inicio.year
        ini_y = inicio + pd.DateOffset(years=shift)
        if ini_y <= idx[0] or ini_y > ultimo:
            continue
        base = cum.iloc[idx.searchsorted(ini_y) - 1]
        pos = np.searchsorted(cum.values, base + falta)
        if pos >= len(cum):
            continue
        out[anio] = idx[pos] - pd.DateOffset(years=shift)
    return pd.Series(out), obs


# ----------------------------- 3. CLIMATOLOGÍA --------------------------------
def climatologia(df):
    """Probabilidad histórica de día apto por día calendario (mes-día)."""
    pre, post = DIAS_SECOS_PREVIOS, DIAS_SECOS_POSTERIORES
    ll = (df["PRECTOTCORR"] >= LLUVIA_MM).astype(float).where(df["PRECTOTCORR"].notna())
    ventana = ll.rolling(pre + post + 1).sum().shift(-post)   # cubre [D-pre, D+post]
    suelo_ok = (df["GWETTOP"] <= UMBRAL_SUELO).astype(float).where(df["GWETTOP"].notna())
    apto = ((ventana == 0).astype(float) * suelo_ok).where(ventana.notna() & suelo_ok.notna())

    clave = pd.Index(df.index.strftime("%m-%d"))
    t = pd.DataFrame({"clave": clave, "apto": apto.values, "lluvia": ll.values,
                      "suelo": df["GWETTOP"].values})
    t = t[t["clave"] != "02-29"]
    cal = pd.Index(pd.date_range("2001-01-01", periods=365).strftime("%m-%d"))
    g = t.groupby("clave")
    out = pd.DataFrame({
        "p_apto_clima": g["apto"].mean(),
        "p_lluvia_clima": g["lluvia"].mean(),
        "suelo_p10": g["suelo"].quantile(CUANT[0]),
        "suelo_p50": g["suelo"].quantile(CUANT[1]),
        "suelo_p90": g["suelo"].quantile(CUANT[2]),
    }).reindex(cal)
    k = SUAVIZADO_DIAS
    ext = pd.concat([out.iloc[-k:], out, out.iloc[:k]])
    out = ext.rolling(2 * k + 1, center=True, min_periods=1).mean().iloc[k:-k]
    out.index = cal
    return out


# ------------------------- 4. PRONÓSTICO DE CORTO PLAZO -----------------------
def columnas_modelo(df):
    return [c for c in ["GWETTOP", "GWETROOT", "PRECTOTCORR", "T2M", "RH2M",
                        "WS2M", "ALLSKY_SFC_SW_DWN", "PS"] if c in df.columns]


def features(df, h):
    X = pd.DataFrame(index=df.index)
    for c in columnas_modelo(df):
        for lag in (0, 1, 2, 6):
            X[f"{c}_l{lag}"] = df[c].shift(lag)
        X[f"{c}_m7"] = df[c].rolling(7).mean()
    for n in (7, 15, 30):
        X[f"lluvia_s{n}"] = df["PRECTOTCORR"].rolling(n).sum()
    if "PS" in df.columns:                       # tendencia de presión (frentes)
        X["ps_d1"] = df["PS"].diff(1)
        X["ps_d3"] = df["PS"].diff(3)
    doy = (df.index + pd.Timedelta(days=h)).dayofyear
    X["sen"] = np.sin(2 * np.pi * doy / 365.25)
    X["cos"] = np.cos(2 * np.pi * doy / 365.25)
    return X


def modelo_q(q):
    return HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=100,
                                         learning_rate=0.08, max_depth=3, random_state=0)


def modelo_c():
    return HistGradientBoostingClassifier(max_iter=100, learning_rate=0.08,
                                          max_depth=3, random_state=0)


def objetivos(df, h):
    lluvia_fut = df["PRECTOTCORR"].shift(-h)
    yl = (lluvia_fut >= LLUVIA_MM).astype(float).where(lluvia_fut.notna())
    return yl.rename("yl"), df["GWETTOP"].shift(-h).rename("ys")


def pronostico_corto(df):
    H, post, pre = HORIZONTE_CORTO, DIAS_SECOS_POSTERIORES, DIAS_SECOS_PREVIOS
    ultimo = df.index[-1]
    dfm = df[df.index >= ultimo - pd.DateOffset(years=ANIOS_ENTRENAMIENTO)]
    p_ll, bandas = {}, {}
    for h in range(1, H + post + 1):
        X = features(dfm, h)
        yl, ys = objetivos(dfm, h)
        d = pd.concat([X, yl, ys], axis=1)
        dl = d.dropna(subset=["yl"])
        p_ll[h] = modelo_c().fit(dl[X.columns], dl["yl"].astype(int)
                                 ).predict_proba(X.iloc[[-1]])[0, 1]
        if h <= H:
            ds = d.dropna(subset=["ys"])
            q = [modelo_q(c).fit(ds[X.columns], ds["ys"]).predict(X.iloc[[-1]])[0]
                 for c in CUANT]
            bandas[h] = np.clip(np.sort(q), 0, 1)

    lluvia_obs = df["PRECTOTCORR"] >= LLUVIA_MM
    filas = []
    for h in range(1, H + 1):
        dia = ultimo + pd.Timedelta(days=h)
        p_seco = 1.0
        for d in pd.date_range(dia - pd.Timedelta(days=pre), dia + pd.Timedelta(days=post)):
            if d <= ultimo:                      # ya observado
                p_seco *= 0.0 if bool(lluvia_obs.get(d, False)) else 1.0
            else:                                # pronosticado
                p_seco *= 1 - p_ll[(d - ultimo).days]
        b = bandas[h]
        p_suelo = float(np.interp(UMBRAL_SUELO, b, CUANT, left=0.05, right=0.95))
        filas.append({"fecha": dia, "suelo_p10": b[0], "suelo_p50": b[1],
                      "suelo_p90": b[2], "p_lluvia": p_ll[h],
                      "p_sin_lluvia_ventana": p_seco, "p_suelo_ok": p_suelo,
                      "p_apto_pron": p_seco * p_suelo})
    return pd.DataFrame(filas).set_index("fecha")


def verificar_corto(df):
    ultimo = df.index[-1]
    dfm = df[df.index >= ultimo - pd.DateOffset(years=ANIOS_ENTRENAMIENTO)]
    filas = []
    for h in (1, 3, 7):
        X = features(dfm, h)
        yl, ys = objetivos(dfm, h)
        d = pd.concat([X, yl, ys], axis=1).dropna()
        corte = d.index[-1] - pd.Timedelta(days=90)
        tr, te = d[d.index <= corte], d[d.index > corte]
        F = X.columns
        pl = modelo_c().fit(tr[F], tr["yl"].astype(int)).predict_proba(te[F])[:, 1]
        B = np.sort(np.column_stack(
            [modelo_q(q).fit(tr[F], tr["ys"]).predict(te[F]) for q in CUANT]), axis=1)
        filas.append({
            "horizonte_dias": h,
            "cobertura_banda_80%": round(float(np.mean((te["ys"] >= B[:, 0]) & (te["ys"] <= B[:, 2]))), 2),
            "Brier_lluvia_modelo": round(brier_score_loss(te["yl"].astype(int), pl), 3),
            "Brier_lluvia_climatologia": round(brier_score_loss(
                te["yl"].astype(int), np.full(len(te), tr["yl"].mean())), 3),
        })
    print("\nVerificación del modelo corto (últimos 90 días). Ideal: cobertura ~0.80 "
          "y Brier_modelo < Brier_climatologia:")
    print(pd.DataFrame(filas).to_string(index=False))


# ------------------------------- 5. RANGOS ------------------------------------
def rangos(rank, estados):
    ok = rank["estado"].isin(estados).to_numpy()
    out, i = [], 0
    while i < len(ok):
        if ok[i]:
            j = i
            while j + 1 < len(ok) and ok[j + 1]:
                j += 1
            if j - i + 1 >= VENTANA_MIN:
                out.append({"desde": rank.index[i].date(), "hasta": rank.index[j].date(),
                            "dias": j - i + 1,
                            "prob_apto_media": round(float(rank["p_apto"].iloc[i:j + 1].mean()), 2)})
            i = j + 1
        else:
            i += 1
    return pd.DataFrame(out, columns=["desde", "hasta", "dias", "prob_apto_media"])


# --------------------------------- MAIN ---------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cultivo"); ap.add_argument("--siembra")
    ap.add_argument("--lat", type=float); ap.add_argument("--lon", type=float)
    a, _ = ap.parse_known_args()
    cultivo = (a.cultivo or CULTIVO)
    siembra = pd.Timestamp(a.siembra or FECHA_SIEMBRA)
    lat, lon = (a.lat if a.lat is not None else LAT), (a.lon if a.lon is not None else LON)

    clave_c = cultivo.strip().lower().replace("í", "i").replace("á", "a")
    if clave_c not in CULTIVOS:
        sys.exit(f"Cultivo '{cultivo}' no válido. Opciones: soja, maíz, trigo, sorgo.")
    c = CULTIVOS[clave_c]

    print(f"{c['nombre']} | siembra {siembra.date()} | punto ({lat}, {lon})")
    df = preparar(descargar(lat, lon))
    ultimo = df.index[-1]
    print(f"Datos POWER: {df.index[0].date()} -> {ultimo.date()} ({len(df)} días)")

    # --- Madurez ---
    gdd = grados_dia(df, c)
    mad, gdd_obs = simular_madurez(gdd, siembra, c["gdd"])
    if len(mad) < 5 and gdd_obs < c["gdd"]:      # (si ya maduró, hay una sola fecha real)
        sys.exit("Pocos años históricos para simular. Bajá ANIO_INICIO_HISTORIA.")
    ordn = np.array([d.toordinal() for d in mad])
    m10, m50, m90 = [pd.Timestamp.fromordinal(int(round(np.quantile(ordn, p))))
                     for p in (0.10, 0.50, 0.90)]
    print(f"\nGrados-día acumulados desde la siembra: {gdd_obs:.0f} de {c['gdd']}")
    if gdd_obs >= c["gdd"]:
        print(f"El cultivo YA alcanzó la madurez según los datos reales: {m50.date()}")
    else:
        print(f"Madurez estimada: p10 {m10.date()} | mediana {m50.date()} | p90 {m90.date()}"
              f"  ({len(mad)} años simulados)")

    # --- Ventana de cosecha ---
    ini = max(m10 + pd.Timedelta(days=c["secado"][0]), ultimo + pd.Timedelta(days=1))
    fin = m90 + pd.Timedelta(days=c["secado"][1] + MARGEN_DIAS)
    if fin <= ini:
        fin = ini + pd.Timedelta(days=30)
    dias = pd.date_range(ini, fin)
    print(f"Ventana de cosecha evaluada: {ini.date()} -> {fin.date()} ({len(dias)} días)")

    # --- Climatología ---
    clima = climatologia(df)
    claves = pd.Index(dias.strftime("%m-%d")).str.replace("02-29", "02-28")
    rank = clima.reindex(claves).copy()
    rank.index = dias
    rank.index.name = "fecha"
    rank["p_apto"] = rank["p_apto_clima"]
    rank["fuente"] = "climatología"
    pct = (df.loc[df.index.month.isin(dias.month), "GWETTOP"] <= UMBRAL_SUELO).mean()
    print(f"Umbral de suelo {UMBRAL_SUELO:.2f} = percentil {pct * 100:.0f} de la humedad "
          "histórica en esa época del año.")

    # --- Pronóstico corto ---
    usar_corto = (PRONOSTICO_CORTO is True or
                  (PRONOSTICO_CORTO == "auto" and ini <= ultimo + pd.Timedelta(days=HORIZONTE_CORTO)))
    pron = None
    if usar_corto:
        print("\nEntrenando pronóstico de corto plazo (unos segundos)...")
        if VERIFICAR:
            verificar_corto(df)
        pron = pronostico_corto(df)
        comunes = rank.index.intersection(pron.index)
        rank.loc[comunes, "p_apto"] = pron.loc[comunes, "p_apto_pron"]
        for col in ("suelo_p10", "suelo_p50", "suelo_p90"):
            rank.loc[comunes, col] = pron.loc[comunes, col]
        rank.loc[comunes, "p_lluvia_clima"] = pron.loc[comunes, "p_lluvia"]
        rank.loc[comunes, "fuente"] = "pronóstico"
    else:
        print("\nLa cosecha cae más allá del horizonte de pronóstico: se usa climatología. "
              "Volvé a correr el script cuando falten ~10 días.")

    # --- Estado, puntaje y recomendación ---
    rank["estado"] = np.where(rank["p_apto"] >= P_RECOMENDADO, "RECOMENDADO",
                      np.where(rank["p_apto"] >= P_POSIBLE, "POSIBLE", "NO RECOMENDADO"))
    rank["dias_espera"] = (rank.index - ini).days
    rank["puntaje"] = rank["p_apto"] - PEN_DEMORA * rank["dias_espera"]
    mejor = rank["puntaje"].idxmax()

    print(f"\nREGLAS: sin lluvia {DIAS_SECOS_PREVIOS} días antes y {DIAS_SECOS_POSTERIORES} "
          f"días después, suelo <= {UMBRAL_SUELO} (lluvia = {LLUVIA_MM} mm o más)")
    print(f"FECHA RECOMENDADA: {mejor.date()}  "
          f"(prob. de día apto {rank.loc[mejor, 'p_apto']:.0%}, fuente: {rank.loc[mejor, 'fuente']})")
    print("\nTop 5 días:")
    print(rank.sort_values("puntaje", ascending=False).head(5)[
        ["p_apto", "p_lluvia_clima", "suelo_p50", "estado", "fuente"]].round(2).to_string())

    r_cons, r_prob = rangos(rank, ["RECOMENDADO"]), rangos(rank, ["RECOMENDADO", "POSIBLE"])
    for nombre, r in (("CONSERVADOR (solo RECOMENDADO)", r_cons),
                      ("AMPLIO (RECOMENDADO + POSIBLE)", r_prob)):
        txt = "; ".join(f"{x.desde} a {x.hasta} ({x.dias} d)" for x in r.itertuples()) or "ninguno"
        print(f"Rangos {nombre}: {txt}")

    # --- Excel ---
    salida = f"recomendacion_cosecha_{c['nombre']}_{siembra.date()}.xlsx"
    resumen = pd.DataFrame([
        ("cultivo", c["nombre"]), ("fecha_siembra", siembra.date()), ("lat", lat), ("lon", lon),
        ("ultimo_dato_POWER", ultimo.date()),
        ("grados_dia_objetivo", c["gdd"]), ("grados_dia_acumulados_reales", round(gdd_obs)),
        ("madurez_p10", m10.date()), ("madurez_p50", m50.date()), ("madurez_p90", m90.date()),
        ("ventana_inicio", ini.date()), ("ventana_fin", fin.date()),
        ("FECHA_RECOMENDADA", mejor.date()),
        ("prob_dia_apto", round(float(rank.loc[mejor, "p_apto"]), 2)),
        ("fuente_recomendacion", rank.loc[mejor, "fuente"]),
        ("dias_secos_previos", DIAS_SECOS_PREVIOS), ("dias_secos_posteriores", DIAS_SECOS_POSTERIORES),
        ("lluvia_mm", LLUVIA_MM), ("umbral_suelo", UMBRAL_SUELO),
    ], columns=["concepto", "valor"])
    out = rank.reset_index()
    out["fecha"] = out["fecha"].dt.date
    with pd.ExcelWriter(salida, engine="openpyxl") as xw:
        resumen.to_excel(xw, sheet_name="resumen", index=False)
        out.round(3).to_excel(xw, sheet_name="ranking_dias", index=False)
        r_cons.to_excel(xw, sheet_name="rangos_conservador", index=False)
        r_prob.to_excel(xw, sheet_name="rangos_amplio", index=False)
        pd.DataFrame({"anio_historico": mad.index,
                      "madurez_equivalente": [pd.Timestamp(d).date() for d in mad.values]}
                     ).to_excel(xw, sheet_name="madurez_simulada", index=False)
        if pron is not None:
            p = pron.reset_index(); p["fecha"] = p["fecha"].dt.date
            p.round(3).to_excel(xw, sheet_name="pronostico_corto", index=False)

    # --- Gráfico ---
    colores = rank["estado"].map({"RECOMENDADO": "green", "POSIBLE": "gold",
                                  "NO RECOMENDADO": "tomato"})
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    a1.bar(rank.index, rank["p_apto"], color=colores, width=1.0)
    a1.plot(rank.index, rank["p_apto_clima"], color="black", lw=1, label="Climatología histórica")
    a1.axvline(mejor, color="blue", ls="--", label=f"Recomendada: {mejor.date()}")
    a1.set_ylabel("Prob. de día apto"); a1.set_ylim(0, 1); a1.legend(loc="upper right")
    a1.set_title(f"{c['nombre']} sembrada el {siembra.date()} · madurez estimada "
                 f"{m10.date()} / {m50.date()} / {m90.date()}", fontsize=10)
    a2.fill_between(rank.index, rank["suelo_p10"], rank["suelo_p90"], alpha=0.3, label="Banda p10-p90")
    a2.plot(rank.index, rank["suelo_p50"], label="Mediana")
    a2.axhline(UMBRAL_SUELO, color="red", ls="--", label="Umbral")
    a2.set_ylabel("Humedad del suelo (GWETTOP)"); a2.legend(loc="upper right")
    a2.set_xlim(rank.index[0], rank.index[-1])
    fig.autofmt_xdate(); fig.tight_layout()
    fig.savefig(salida.replace(".xlsx", ".png"), dpi=120)
    print(f"\nArchivos: {salida} y {salida.replace('.xlsx', '.png')}")


if __name__ == "__main__":
    main()
