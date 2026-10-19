// Fuente de datos EN VIVO de remontes/pistas — PARALELO e INDEPENDIENTE del
// motor de analisis (turf_framework_core.ts) y del calculador de grafo
// (graph_router.ts).
//
// Diseño: un "DominioEsquiable" es la unidad configurable (hoy solo Portes du
// Soleil esta activo; anadir una estacion nueva que nos contrate en el futuro
// es anadir una entrada a DOMINIOS_CONFIGURADOS, no escribir codigo nuevo).
//
// Fuente real verificada (2026-10-19, solo lectura, no se toca lyai-ski):
// Intermaps expone un endpoint JSON publico sin autenticacion por dominio,
// en el patron https://winter.intermaps.com/<slug>/data?lang=<idioma>.
// Confirmado con Portes du Soleil (ya en produccion en lyai-ski,
// backend/services/intermaps_feed.py) y, probando a ciegas, tambien con
// SkiWelt Wilder Kaiser-Brixental, Zillertal 3000 y Silvretta Arena
// (estaciones austriacas, mismo esquema JSON exacto: lifts/slopes/routes/pois).
//
// ADVERTENCIA heredada de lyai-ski (verificada en su codigo): el `oid` de
// Intermaps NO es un identificador unico fiable entre estaciones — puede
// repetirse en dominios distintos a kilometros de distancia. Cualquier cruce
// de datos por oid debe validarse tambien por nombre normalizado, igual que
// hace lyai-ski.

export type EstadoElemento = "open" | "closed" | "closed_outoforder" | "in_preparation" | string;

export type ProveedorFeed = "intermaps" | "lumiplan" | "esquiades";

export interface ElementoIntermaps {
    oid: string;
    nombre: string;
    status: EstadoElemento;
    tipo: "remonte" | "pista";
}

export interface DominioEsquiable {
    /** Identificador interno LyAi */
    id: string;
    nombre: string;
    proveedor?: ProveedorFeed;
    /** Slug usado en Intermaps (si proveedor === 'intermaps') */
    slugIntermaps?: string;
    /** ID de estación en Lumiplan SkiPlus WS (si proveedor === 'lumiplan') */
    stationIdLumiplan?: number;
    /** ID de estación en Esquiades (si proveedor === 'esquiades') */
    idPistaEsquiades?: number;
    idioma: string;
    /** Si false, el dominio esta documentado pero no se consulta */
    activo: boolean;
}

/**
 * Catalogo de dominios configurables.
 */
export const DOMINIOS_CONFIGURADOS: DominioEsquiable[] = [
    {
        id: "portes-du-soleil",
        nombre: "Portes du Soleil",
        proveedor: "intermaps",
        slugIntermaps: "portes_du_soleil",
        idioma: "fr",
        activo: true
    },
    // Ejemplos verificados Intermaps:
    { id: "skiwelt", nombre: "SkiWelt Wilder Kaiser-Brixental", proveedor: "intermaps", slugIntermaps: "skiwelt", idioma: "de", activo: false },
    { id: "zillertal-3000", nombre: "Zillertal 3000", proveedor: "intermaps", slugIntermaps: "zillertal_3000", idioma: "de", activo: false },
    { id: "silvretta-arena", nombre: "Silvretta Arena Ischgl/Samnaun", proveedor: "intermaps", slugIntermaps: "silvretta_arena", idioma: "de", activo: false },
    // Estaciones verificadas Lumiplan (Mountain Live / Val d'Isere REA 2026-10-19):
    { id: "val-disere-lumiplan", nombre: "Val d'Isère (Lumiplan)", proveedor: "lumiplan", stationIdLumiplan: 44, idioma: "fr", activo: false },
    { id: "tignes-lumiplan", nombre: "Tignes (Lumiplan)", proveedor: "lumiplan", stationIdLumiplan: 43, idioma: "fr", activo: false },
    { id: "courchevel", nombre: "Courchevel - Les 3 Vallées", proveedor: "lumiplan", stationIdLumiplan: 3, idioma: "fr", activo: false },
    { id: "serre-chevalier-lumiplan", nombre: "Serre Chevalier (Lumiplan)", proveedor: "lumiplan", stationIdLumiplan: 21, idioma: "fr", activo: false },
    // Estaciones verificadas Esquiades (España, Andorra, Francia REA 2026-10-19):
    { id: "baqueira-beret", nombre: "Baqueira Beret", proveedor: "esquiades", idPistaEsquiades: 11, idioma: "es", activo: false },
    { id: "formigal", nombre: "Formigal Panticosa", proveedor: "esquiades", idPistaEsquiades: 16, idioma: "es", activo: false },
    { id: "sierra-nevada", nombre: "Sierra Nevada", proveedor: "esquiades", idPistaEsquiades: 14, idioma: "es", activo: false },
    { id: "grandvalira", nombre: "Grandvalira", proveedor: "esquiades", idPistaEsquiades: 1, idioma: "es", activo: false },
    { id: "cerler", nombre: "Cerler", proveedor: "esquiades", idPistaEsquiades: 18, idioma: "es", activo: false },
    { id: "val-disere-esquiades", nombre: "Val d'Isère (Esquiades)", proveedor: "esquiades", idPistaEsquiades: 9, idioma: "es", activo: false }
];

const CLOSED_STATUSES = new Set<EstadoElemento>(["closed", "closed_outoforder"]);

function urlFeed(dominio: DominioEsquiable): string {
    return `https://winter.intermaps.com/${dominio.slugIntermaps}/data?lang=${dominio.idioma}`;
}

interface RespuestaIntermapsCruda {
    lifts?: Array<{ popup?: { oid?: string; title?: string; status?: string }; status?: string }>;
    slopes?: Array<{ popup?: { oid?: string; title?: string; status?: string }; status?: string }>;
    lastUpdate?: string;
}

/** Parsea la respuesta cruda de Intermaps a una lista homogenea. No hace fetch. */
export function parsearRespuestaIntermaps(data: RespuestaIntermapsCruda): ElementoIntermaps[] {
    const elementos: ElementoIntermaps[] = [];

    for (const [clave, tipo] of [["lifts", "remonte"], ["slopes", "pista"]] as const) {
        for (const it of data[clave] ?? []) {
            const popup = it.popup ?? {};
            const oid = popup.oid;
            const nombre = popup.title;
            const status = it.status ?? popup.status;
            if (!oid || !nombre || !status) continue;
            elementos.push({ oid: String(oid), nombre, status, tipo });
        }
    }

    return elementos;
}

export function oidsCerrados(elementos: ElementoIntermaps[]): Set<string> {
    const cerrados = new Set<string>();
    for (const el of elementos) {
        if (CLOSED_STATUSES.has(el.status)) cerrados.add(el.oid);
    }
    return cerrados;
}

export interface EstadoDominio {
    dominio: DominioEsquiable;
    elementos: ElementoIntermaps[];
    oidsCerrados: Set<string>;
    obtenidoEn: Date;
}

/**
 * Obtiene el estado en vivo de un dominio esquiable CONFIGURADO Y ACTIVO.
 * Lanza si el dominio no esta activo (alcance deliberado: no se consulta
 * nada que no se haya decidido activar explicitamente).
 */
export async function obtenerEstadoDominio(dominioId: string): Promise<EstadoDominio> {
    const dominio = DOMINIOS_CONFIGURADOS.find((d) => d.id === dominioId);
    if (!dominio) {
        throw new Error(`Dominio esquiable no configurado: ${dominioId}`);
    }
    if (!dominio.activo) {
        throw new Error(`Dominio esquiable '${dominioId}' esta configurado pero no activo (fuera de alcance actual)`);
    }

    const resp = await fetch(urlFeed(dominio));
    if (!resp.ok) {
        throw new Error(`Fallo al obtener feed de ${dominio.nombre}: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as RespuestaIntermapsCruda;
    const elementos = parsearRespuestaIntermaps(data);

    return {
        dominio,
        elementos,
        oidsCerrados: oidsCerrados(elementos),
        obtenidoEn: new Date()
    };
}

// ------------------------------------------------------------------ Lumiplan (Mountain Live)
export const LUMIPLAN_API_BASE_FR = "https://skiplusfr.lumiplan.pro/skiplus-ws/ws";

export interface RespuestaLumiplanCruda {
    statut?: number;
    etatCielStation?: number;
    etatCielAltitude?: number;
    tempStation?: number;
    tempAltitude?: number;
    hauteurNeigeStation?: number;
    hauteurNeigeAltitude?: number;
    hauteurNeigeFraiche?: number;
    dateNeigeFraiche?: number;
    nbPistesTotal?: number;
    nbPistesOuvertes?: number;
    nbRemonteesTotal?: number;
    nbRemonteesOuvertes?: number;
    nomStation?: string;
}

export interface TelemetriaLumiplan {
    estacionId: number;
    nombre?: string;
    tempValle?: number;
    tempCima?: number;
    nieveValleCm: number;
    nieveCimaCm: number;
    nieveFrescaCm: number;
    pistasTotal: number;
    pistasAbiertas: number;
    remonteesTotal: number;
    remonteesAbiertos: number;
    porcentajePistasAbiertas: number;
    porcentajeRemonteesAbiertos: number;
    actualizadoEn: Date;
}

export function parsearRespuestaLumiplan(estacionId: number, data: RespuestaLumiplanCruda): TelemetriaLumiplan {
    const pTotal = data.nbPistesTotal ?? 0;
    const pOpen = data.nbPistesOuvertes ?? 0;
    const rTotal = data.nbRemonteesTotal ?? 0;
    const rOpen = data.nbRemonteesOuvertes ?? 0;

    return {
        estacionId,
        nombre: data.nomStation,
        tempValle: data.tempStation,
        tempCima: data.tempAltitude,
        nieveValleCm: data.hauteurNeigeStation ?? 0,
        nieveCimaCm: data.hauteurNeigeAltitude ?? 0,
        nieveFrescaCm: data.hauteurNeigeFraiche ?? 0,
        pistasTotal: pTotal,
        pistasAbiertas: pOpen,
        remonteesTotal: rTotal,
        remonteesAbiertos: rOpen,
        porcentajePistasAbiertas: pTotal > 0 ? Math.round((pOpen / pTotal) * 100) : 0,
        porcentajeRemonteesAbiertos: rTotal > 0 ? Math.round((rOpen / rTotal) * 100) : 0,
        actualizadoEn: new Date()
    };
}

export async function obtenerTelemetriaLumiplan(estacionId: number, baseUrl = LUMIPLAN_API_BASE_FR): Promise<TelemetriaLumiplan> {
    const url = `${baseUrl.replace(/\/$/, "")}/station/${estacionId}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Fallo al consultar Lumiplan station/${estacionId}: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as RespuestaLumiplanCruda;
    return parsearRespuestaLumiplan(estacionId, data);
}

// -----------------------------------------------------------------------------
// Proveedor Esquiades (España, Andorra, Francia, Alpes)
// Extraído por ingeniería inversa de com.esquiades (Constants.java)
// Endpoints: /appmovil/json/v1/get_pistas.php y /appmovil/json/v1/info_pista.php?idPista={id}
// -----------------------------------------------------------------------------

export const ESQUIADES_API_BASE = "https://www.esquiades.com/appmovil/json/v1";

export interface WebcamEsquiades {
    id: string;
    url: string;
    textoUbicacion?: string;
    fechaActualizacion?: string;
    tipo?: string;
}

export interface ParteNieveEsquiades {
    estacionId: number;
    nombre: string;
    abierta: boolean;
    textoApertura?: string;
    kmEsquiablesActual: number;
    kmEsquiablesTotal: number;
    tipoNieve?: string;
    pistasTotal: number;
    pistasAbiertas: number;
    remontesTotal: number;
    remontesAbiertos: number;
    pistasVerdesAbiertas?: number;
    pistasAzulesAbiertas?: number;
    pistasRojasAbiertas?: number;
    pistasNegrasAbiertas?: number;
    fechaUltimaNevada?: string;
    cmUltimaNevada?: number;
    gruesoNieve?: string;
    webcams: WebcamEsquiades[];
    actualizadoEn: Date;
}

export function parsearRespuestaEsquiades(data: any): ParteNieveEsquiades {
    const est = data.estado ?? {};
    const webcamsRaw = Array.isArray(data.webcam) ? data.webcam : [];

    const webcams: WebcamEsquiades[] = webcamsRaw.map((w: any) => ({
        id: String(w.id ?? ""),
        url: w.url_panoramica || w.url || "",
        textoUbicacion: w.texto_ubicacion,
        fechaActualizacion: w.fecha_actualizacion,
        tipo: w.tipo
    }));

    return {
        estacionId: data.id ?? est.pista_id ?? 0,
        nombre: data.nombre ?? "Estación",
        abierta: Boolean(est.abierta),
        textoApertura: est.texto_apertura,
        kmEsquiablesActual: parseFloat(est.km_esquiables_actual) || 0,
        kmEsquiablesTotal: parseFloat(est.km_esquiables_total) || 0,
        tipoNieve: est.tipo_nieve,
        pistasTotal: parseInt(est.pistas_abiertas_total, 10) || 0,
        pistasAbiertas: parseInt(est.pistas_abiertas_actual, 10) || 0,
        remontesTotal: parseInt(est.total_ski_lifts, 10) || 0,
        remontesAbiertos: parseInt(est.open_ski_lifts, 10) || 0,
        pistasVerdesAbiertas: est.pistas_verdes_abiertas != null ? parseInt(est.pistas_verdes_abiertas, 10) : undefined,
        pistasAzulesAbiertas: est.pistas_azules_abiertas != null ? parseInt(est.pistas_azules_abiertas, 10) : undefined,
        pistasRojasAbiertas: est.pistas_rojas_abiertas != null ? parseInt(est.pistas_rojas_abiertas, 10) : undefined,
        pistasNegrasAbiertas: est.pistas_negras_abiertas != null ? parseInt(est.pistas_negras_abiertas, 10) : undefined,
        fechaUltimaNevada: est.fecha_ultima_nevada,
        cmUltimaNevada: est.cm_ultima_nevada != null ? parseFloat(est.cm_ultima_nevada) : undefined,
        gruesoNieve: est.grueso_nieve,
        webcams,
        actualizadoEn: new Date()
    };
}

export async function obtenerParteNieveEsquiades(
    idPista: number,
    baseUrl = ESQUIADES_API_BASE
): Promise<ParteNieveEsquiades> {
    const url = `${baseUrl.replace(/\/$/, "")}/info_pista.php?idPista=${idPista}`;
    const resp = await fetch(url, {
        headers: { "User-Agent": "okhttp/4.12.0" }
    });
    if (!resp.ok) {
        throw new Error(`Fallo al consultar Esquiades idPista=${idPista}: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return parsearRespuestaEsquiades(data);
}

