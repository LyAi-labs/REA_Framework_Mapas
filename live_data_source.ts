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

export type ProveedorFeed = "intermaps" | "lumiplan";

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
    idioma: string;
    /** Si false, el dominio esta documentado pero no se consulta */
    activo: boolean;
}

/**
 * Catalogo de dominios configurables. Solo Portes du Soleil esta `activo: true`
 * por decision explicita (2026-10-19): no cargar mas estaciones todavia, pero
 * dejar la estructura lista para activar una nueva con una sola linea cuando
 * haya contrato real.
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
    // Estaciones verificadas Lumiplan (Mountain Live REA 2026-10-19):
    { id: "courchevel", nombre: "Courchevel - Les 3 Vallées", proveedor: "lumiplan", stationIdLumiplan: 3, idioma: "fr", activo: false },
    { id: "la-mongie", nombre: "Grand Tourmalet / La Mongie", proveedor: "lumiplan", stationIdLumiplan: 127, idioma: "fr", activo: false },
    { id: "font-romeu", nombre: "Font Romeu Pyrénées 2000", proveedor: "lumiplan", stationIdLumiplan: 38, idioma: "fr", activo: false }
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

