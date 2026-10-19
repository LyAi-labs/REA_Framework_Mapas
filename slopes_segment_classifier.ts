// Clasificador de Segmentos de Nieve (Remontes vs Bajadas vs Travesia)
// Ingenieria Inversa de la app Slopes (com.consumedbycode.slopes) - Octubre 2026.
//
// Implementa con fidelidad matematica las formulas extraidas del desensamblado de
// `P3/v.java`, `LocationFilterJson.java` y `SegmentJson.java`.

export type TipoSegmento = "UNKNOWN" | "LIFT" | "RUN" | "USER_ASCENT" | "USER_MIXED" | "DRIVE";

export interface PuntoGPS {
    lat: number;
    lon: number;
    alt: number;
    timestampMs: number;
    velocidadMs?: number;
    precisionM?: number;
}

export interface LineaRemonteConocida {
    id: string;
    nombre: string;
    coords: [number, number][]; // [lon, lat]
}

export interface SegmentoTrack {
    puntos: PuntoGPS[];
    tipo: TipoSegmento;
    distanciaTotalM: number;
    desnivelM: number;
    duracionSegundos: number;
    velocidadMediaMs: number;
    velocidadMaxMs: number;
    remonteCoincidente?: string;
    motivoClasificacion: string;
}

const R_TIERRA = 6371000;

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R_TIERRA * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distancia minima de un punto a una polilinea de remonte (en metros).
 */
export function distanciaMinimaARemonte(pt: PuntoGPS, remonte: LineaRemonteConocida): number {
    let minD = Infinity;
    for (const [lon, lat] of remonte.coords) {
        const d = haversine(pt.lon, pt.lat, lon, lat);
        if (d < minD) minD = d;
    }
    return minD;
}

/**
 * Clasifica un segmento de puntos GPS segun las reglas exactas de Slopes.
 */
export function clasificarSegmento(
    puntos: PuntoGPS[],
    remontesConocidos: LineaRemonteConocida[] = []
): SegmentoTrack {
    if (puntos.length < 2) {
        return {
            puntos,
            tipo: "UNKNOWN",
            distanciaTotalM: 0,
            desnivelM: 0,
            duracionSegundos: 0,
            velocidadMediaMs: 0,
            velocidadMaxMs: 0,
            motivoClasificacion: "Puntos insuficientes (< 2)"
        };
    }

    // 1. Filtrar puntos con precision degradada extrema (jitter de salida de estacion)
    const puntosValidos = puntos.filter(p => (p.precisionM === undefined || p.precisionM <= 50));
    const pts = puntosValidos.length >= 2 ? puntosValidos : puntos;

    // 2. Calcular distancias acumuladas y velocidades
    let distanciaTotalM = 0;
    let velMaxMs = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = haversine(pts[i - 1].lon, pts[i - 1].lat, pts[i].lon, pts[i].lat);
        distanciaTotalM += d;
        const dt = (pts[i].timestampMs - pts[i - 1].timestampMs) / 1000;
        const v = dt > 0 ? d / dt : (pts[i].velocidadMs ?? 0);
        if (v > velMaxMs) velMaxMs = v;
    }

    const primerPto = pts[0];
    const ultimoPto = pts[pts.length - 1];
    const desnivelM = ultimoPto.alt - primerPto.alt;
    const duracionSegundos = Math.max(1, (ultimoPto.timestampMs - primerPto.timestampMs) / 1000);
    const velocidadMediaMs = distanciaTotalM / duracionSegundos;

    // 3. Deteccion de vehiculo en carretera (Drive Detector): velocidad sostenida de automovil (> 28 m/s = > 100 km/h)
    if (velMaxMs > 28.0 && Math.abs(desnivelM) < 20.0) {
        return {
            puntos: pts,
            tipo: "DRIVE",
            distanciaTotalM: Math.round(distanciaTotalM * 10) / 10,
            desnivelM: Math.round(desnivelM * 10) / 10,
            duracionSegundos: Math.round(duracionSegundos),
            velocidadMediaMs: Math.round(velocidadMediaMs * 10) / 10,
            velocidadMaxMs: Math.round(velMaxMs * 10) / 10,
            motivoClasificacion: "DriveDetector: velocidad de vehiculo por carretera"
        };
    }

    // 4. Verificacion de proximidad a remontes del mapa cartografico
    let remonteCoincidente: string | undefined;
    let distanciaARemonteMin = Infinity;
    for (const remonte of remontesConocidos) {
        const dIni = distanciaMinimaARemonte(primerPto, remonte);
        const dFin = distanciaMinimaARemonte(ultimoPto, remonte);
        const dMin = Math.min(dIni, dFin);
        if (dMin < distanciaARemonteMin) {
            distanciaARemonteMin = dMin;
            if (dMin <= 70.0) {
                remonteCoincidente = remonte.nombre;
            }
        }
    }

    // 5. Formula de Slopes: determinacion inicial de remonte vs bajada
    let tipo: TipoSegmento = "UNKNOWN";
    let motivo = "";

    if (distanciaTotalM > 100.0) {
        if (desnivelM > 1.0) {
            tipo = "LIFT";
            motivo = `Ascenso neto (+${desnivelM.toFixed(1)}m > 1.0m) en >100m`;
        } else {
            tipo = "RUN";
            motivo = `Descenso o llano (${desnivelM.toFixed(1)}m <= 1.0m)`;
        }
    } else {
        tipo = desnivelM > 0.5 ? "LIFT" : "RUN";
        motivo = `Tramo corto (<100m): delta=${desnivelM.toFixed(1)}m`;
    }

    // 6. Proximidad prioritaria a remonte conocido (< 70m de cable/estacion)
    if (remonteCoincidente && tipo !== "RUN") {
        tipo = "LIFT";
        motivo = `Proximidad a remonte conocido '${remonteCoincidente}' (<70m)`;
    }

    // 7. Formula de Slopes: reclasificacion a senderismo / esqui de montana (USER_ASCENT)
    // Regla exacta de P3/v.java line 461:
    // tipo == LIFT && remonteCoincidente == null && distancia > 100 && desnivel >= 25
    // && (desnivel / distancia) < 0.15 && velMedia <= 2.5 m/s && duracion >= 240s && deltaAlt >= 5.0
    if (
        tipo === "LIFT" &&
        !remonteCoincidente &&
        distanciaTotalM > 100.0 &&
        desnivelM >= 25.0 &&
        (desnivelM / distanciaTotalM) < 0.15 &&
        velocidadMediaMs <= 2.5 &&
        duracionSegundos >= 240 &&
        desnivelM >= 5.0
    ) {
        tipo = "USER_ASCENT";
        motivo = "Reclasificado a senderismo/foqueo: pendiente suave a pie (vel <= 2.5m/s, >4 min)";
    }

    return {
        puntos: pts,
        tipo,
        distanciaTotalM: Math.round(distanciaTotalM * 10) / 10,
        desnivelM: Math.round(desnivelM * 10) / 10,
        duracionSegundos: Math.round(duracionSegundos),
        velocidadMediaMs: Math.round(velocidadMediaMs * 10) / 10,
        velocidadMaxMs: Math.round(velMaxMs * 10) / 10,
        remonteCoincidente,
        motivoClasificacion: motivo
    };
}
