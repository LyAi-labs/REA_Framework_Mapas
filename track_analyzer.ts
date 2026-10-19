// Analizador Completo de Tracks GPS (.GPX / .FIT) para Deportes de Invierno y Montana
// Combina el parser binario FIT, el parser XML GPX y el clasificador matematico de Slopes.

import { FitBinaryParser } from "./strava_fit_parser.js";
import {
    clasificarSegmento,
    haversine,
    type PuntoGPS,
    type SegmentoTrack,
    type LineaRemonteConocida,
    type TipoSegmento
} from "./slopes_segment_classifier.js";

export type { PuntoGPS, SegmentoTrack, LineaRemonteConocida, TipoSegmento };

export interface ReporteActividadMontana {
    nombreArchivo?: string;
    formato: "FIT" | "GPX" | "GEOJSON" | "UNKNOWN";
    totalPuntos: number;
    distanciaTotalKm: number;
    desnivelPositivoM: number;
    desnivelNegativoM: number;
    cotaMinM: number;
    cotaMaxM: number;
    duracionTotalMin: number;
    duracionActivaMin: number;
    velocidadMediaKmH: number;
    velocidadMaxKmH: number;
    resumenSegmentos: {
        totalBajadas: number;
        kmBajadas: number;
        desnivelBajadasM: number;
        velMaxBajadasKmH: number;
        totalRemontes: number;
        desnivelRemontesM: number;
        tiempoRemontesMin: number;
        totalTravesia: number;
        kmTravesia: number;
        desnivelTravesiaM: number;
    };
    segmentos: Array<{
        tipo: TipoSegmento;
        distanciaM: number;
        desnivelM: number;
        duracionSegundos: number;
        velMediaKmH: number;
        velMaxKmH: number;
        remonte?: string;
        motivo: string;
    }>;
}

export function parsearGPX(contenidoXml: string): PuntoGPS[] {
    const puntos: PuntoGPS[] = [];
    // Regex eficiente para capturar <trkpt lat="..." lon="...">...<ele>...</ele>...<time>...</time></trkpt>
    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match: RegExpExecArray | null;

    let fallbackTime = Date.now();

    while ((match = trkptRegex.exec(contenidoXml)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const body = match[3];

        const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(body);
        const timeMatch = /<time>([^<]+)<\/time>/i.exec(body);

        const alt = eleMatch ? parseFloat(eleMatch[1]) : 0;
        let timestampMs = fallbackTime;
        if (timeMatch) {
            const parsed = Date.parse(timeMatch[1]);
            if (!isNaN(parsed)) timestampMs = parsed;
        } else {
            fallbackTime += 1000; // 1 segundo incremental por defecto
        }

        if (!isNaN(lat) && !isNaN(lon)) {
            puntos.push({ lat, lon, alt, timestampMs });
        }
    }

    return puntos;
}

export function parsearFIT(bytes: Uint8Array): PuntoGPS[] {
    const parser = new FitBinaryParser();
    const cabecera = parser.parsearCabecera(bytes);
    if (cabecera.firma !== ".FIT") {
        throw new Error("Archivo no tiene firma valida .FIT");
    }
    const registros = parser.parsearTodosLosRegistros(bytes, 14, 16);
    return registros.map((r) => ({
        lat: r.latitud,
        lon: r.longitud,
        alt: r.altitud,
        timestampMs: r.timestamp * 1000
    }));
}

/**
 * Segmenta una secuencia continua de puntos GPS en tramos homogeneos (subidas/remontes vs bajadas).
 */
export function segmentarTrackCompleto(
    puntos: PuntoGPS[],
    remontesConocidos?: LineaRemonteConocida[]
): SegmentoTrack[] {
    if (puntos.length < 2) return [];

    const segmentos: SegmentoTrack[] = [];
    let puntosActuales: PuntoGPS[] = [puntos[0]];
    let direccionActual: "SUBIENDO" | "BAJANDO" | "PLANO" = "PLANO";

    for (let i = 1; i < puntos.length; i++) {
        const prev = puntos[i - 1];
        const curr = puntos[i];
        const dAlt = curr.alt - prev.alt;

        const tendenciaPunto = dAlt > 0.4 ? "SUBIENDO" : dAlt < -0.4 ? "BAJANDO" : "PLANO";

        if (direccionActual === "PLANO" && tendenciaPunto !== "PLANO") {
            direccionActual = tendenciaPunto;
        }

        // Si cambia de subida a bajada clara con suficiente acumulado en el tramo
        const cambioDeSentido = (
            (direccionActual === "SUBIENDO" && tendenciaPunto === "BAJANDO" && puntosActuales.length >= 5) ||
            (direccionActual === "BAJANDO" && tendenciaPunto === "SUBIENDO" && puntosActuales.length >= 5)
        );

        if (cambioDeSentido) {
            segmentos.push(clasificarSegmento(puntosActuales, remontesConocidos));
            puntosActuales = [prev, curr];
            direccionActual = tendenciaPunto;
        } else {
            puntosActuales.push(curr);
        }
    }

    if (puntosActuales.length >= 2) {
        segmentos.push(clasificarSegmento(puntosActuales, remontesConocidos));
    }

    return segmentos;
}

export function analizarTrack(
    puntos: PuntoGPS[],
    nombreArchivo = "track.gpx",
    remontesConocidos?: LineaRemonteConocida[]
): ReporteActividadMontana {
    if (puntos.length < 2) {
        throw new Error("Track requiere al menos 2 puntos GPS validos");
    }

    const formato: ReporteActividadMontana["formato"] =
        /\.fit$/i.test(nombreArchivo) ? "FIT" :
        /\.gpx$/i.test(nombreArchivo) ? "GPX" :
        /\.geojson|\.json$/i.test(nombreArchivo) ? "GEOJSON" : "UNKNOWN";

    let distTotalM = 0;
    let desnivelPos = 0;
    let desnivelNeg = 0;
    let cotaMin = Infinity;
    let cotaMax = -Infinity;
    let velMaxMs = 0;

    for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        if (p.alt < cotaMin) cotaMin = p.alt;
        if (p.alt > cotaMax) cotaMax = p.alt;

        if (i > 0) {
            const prev = puntos[i - 1];
            const dH = haversine(prev.lon, prev.lat, p.lon, p.lat);
            const dZ = p.alt - prev.alt;
            const dtS = Math.max((p.timestampMs - prev.timestampMs) / 1000, 0.1);
            const vMs = dH / dtS;

            distTotalM += dH;
            if (dZ > 0) desnivelPos += dZ;
            else desnivelNeg += Math.abs(dZ);

            if (vMs > velMaxMs && vMs < 50.0) { // Filtrar saltos irreales >180 km/h
                velMaxMs = vMs;
            }
        }
    }

    const duracionTotalS = Math.max((puntos[puntos.length - 1].timestampMs - puntos[0].timestampMs) / 1000, 1);
    const velMediaKmH = duracionTotalS > 0 ? (distTotalM / duracionTotalS) * 3.6 : 0;
    const velMaxKmH = velMaxMs * 3.6;

    // Segmentacion con algoritmo Slopes
    const segmentosClasificados = segmentarTrackCompleto(puntos, remontesConocidos);

    let totalBajadas = 0;
    let kmBajadas = 0;
    let desnivelBajadasM = 0;
    let velMaxBajadasKmH = 0;

    let totalRemontes = 0;
    let desnivelRemontesM = 0;
    let tiempoRemontesS = 0;

    let totalTravesia = 0;
    let kmTravesia = 0;
    let desnivelTravesiaM = 0;

    const segmentosResumen = segmentosClasificados.map((s) => {
        const velMedKmH = s.velocidadMediaMs * 3.6;
        const velMaxSecKmH = s.velocidadMaxMs * 3.6;

        if (s.tipo === "RUN") {
            totalBajadas++;
            kmBajadas += s.distanciaTotalM / 1000;
            desnivelBajadasM += Math.abs(s.desnivelM);
            if (velMaxSecKmH > velMaxBajadasKmH) velMaxBajadasKmH = velMaxSecKmH;
        } else if (s.tipo === "LIFT") {
            totalRemontes++;
            desnivelRemontesM += Math.max(s.desnivelM, 0);
            tiempoRemontesS += s.duracionSegundos;
        } else if (s.tipo === "USER_ASCENT") {
            totalTravesia++;
            kmTravesia += s.distanciaTotalM / 1000;
            desnivelTravesiaM += Math.max(s.desnivelM, 0);
        }

        return {
            tipo: s.tipo,
            distanciaM: Math.round(s.distanciaTotalM),
            desnivelM: Math.round(s.desnivelM),
            duracionSegundos: s.duracionSegundos,
            velMediaKmH: Math.round(velMedKmH * 10) / 10,
            velMaxKmH: Math.round(velMaxSecKmH * 10) / 10,
            remonte: s.remonteCoincidente,
            motivo: s.motivoClasificacion
        };
    });

    return {
        nombreArchivo,
        formato,
        totalPuntos: puntos.length,
        distanciaTotalKm: Math.round((distTotalM / 1000) * 100) / 100,
        desnivelPositivoM: Math.round(desnivelPos),
        desnivelNegativoM: Math.round(desnivelNeg),
        cotaMinM: Math.round(cotaMin),
        cotaMaxM: Math.round(cotaMax),
        duracionTotalMin: Math.round(duracionTotalS / 60),
        duracionActivaMin: Math.round((duracionTotalS - tiempoRemontesS) / 60),
        velocidadMediaKmH: Math.round(velMediaKmH * 10) / 10,
        velocidadMaxKmH: Math.round(velMaxKmH * 10) / 10,
        resumenSegmentos: {
            totalBajadas,
            kmBajadas: Math.round(kmBajadas * 100) / 100,
            desnivelBajadasM: Math.round(desnivelBajadasM),
            velMaxBajadasKmH: Math.round(velMaxBajadasKmH * 10) / 10,
            totalRemontes,
            desnivelRemontesM: Math.round(desnivelRemontesM),
            tiempoRemontesMin: Math.round(tiempoRemontesS / 60),
            totalTravesia,
            kmTravesia: Math.round(kmTravesia * 100) / 100,
            desnivelTravesiaM: Math.round(desnivelTravesiaM)
        },
        segmentos: segmentosResumen
    };
}

export function formatearReporteTelegramMarkdown(reporte: ReporteActividadMontana): string {
    const fn = reporte.nombreArchivo || "Track";
    const res = reporte.resumenSegmentos;

    return `🎿 **Telemetría de Actividad en Montaña**
📁 \`${fn}\` (${reporte.formato}, ${reporte.totalPuntos} puntos)

📏 **Distancia Total**: ${reporte.distanciaTotalKm} km
⏱️ **Tiempo**: ${reporte.duracionTotalMin} min (Activo: ${reporte.duracionActivaMin} min)
🏔️ **Cotas**: ${reporte.cotaMinM} m – ${reporte.cotaMaxM} m (Δ ${reporte.cotaMaxM - reporte.cotaMinM} m)
🚀 **Velocidad Máx**: ${reporte.velocidadMaxKmH} km/h (Media: ${reporte.velocidadMediaKmH} km/h)

⛷️ **Descensos (Bajadas)**:
• Total: **${res.totalBajadas}** bajadas (${res.kmBajadas} km esquiados)
• Desnivel descendido: **-${res.desnivelBajadasM} m**
• Velocidad punta en pista: **${res.velMaxBajadasKmH} km/h**

🚠 **Remontes**:
• Subidas en remonte: **${res.totalRemontes}**
• Desnivel ascendido: **+${res.desnivelRemontesM} m**
• Tiempo en cables: **${res.tiempoRemontesMin} min**` +
(res.totalTravesia > 0 ? `\n\n🧗 **Esquí de Travesía / Foqueo**:\n• Tramos: **${res.totalTravesia}** (${res.kmTravesia} km, +${res.desnivelTravesiaM} m)` : "");
}
