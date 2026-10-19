// Calculador de rutas sobre grafo de nodos — PARALELO e INDEPENDIENTE
// del motor de analisis de tramo unico (turf_framework_core.ts).
//
// Diferencia de enfoque: turf_framework_core.ts analiza una polilinea YA DADA.
// Este modulo recibe un GRAFO (nodos = uniones pista/remonte con coordenadas
// reales, aristas = tramos de pista o remonte) y calcula la RUTA OPTIMA entre
// dos nodos (Dijkstra), ponderada por tiempo real (Tobler para pistas,
// velocidad fija para remontes).
//
// No reutiliza codigo de turf_framework_core.ts a proposito: cada motor debe
// poder evolucionar o sustituirse sin arrastrar al otro.

export interface NodoRuta {
    id: string;
    nombre: string;
    lon: number;
    lat: number;
    elev: number;
}

export type TipoArista = "pista" | "remonte";

export interface AristaRuta {
    desde: string;
    hasta: string;
    tipo: TipoArista;
    /** Solo para remontes: velocidad media en m/s (independiente de la pendiente). */
    velocidadRemonteMs?: number;
    /** Solo para remontes: si es bidireccional (telecabina) o no (telesilla subida). */
    bidireccional?: boolean;
}

export interface TramoRutaCalculada {
    desde: NodoRuta;
    hasta: NodoRuta;
    tipo: TipoArista;
    distanciaHorizontal: number;
    tiempoMinutos: number;
}

export interface RutaCalculada {
    nodos: NodoRuta[];
    tramos: TramoRutaCalculada[];
    distanciaTotal: number;
    tiempoTotalMinutos: number;
}

const R_TIERRA = 6371000;
const VELOCIDAD_REMONTE_DEFECTO_MS = 4; // ~14.4 km/h, tipico de telesilla

function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R_TIERRA * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function velocidadTobler(pendienteSeno: number): number {
    return 6 * Math.exp(-3.5 * Math.abs(pendienteSeno + 0.05));
}

/** Tiempo en minutos para recorrer una arista, segun su tipo. */
function tiempoArista(origen: NodoRuta, destino: NodoRuta, arista: AristaRuta): { distancia: number; minutos: number } {
    const distH = haversine(origen.lon, origen.lat, destino.lon, destino.lat);

    if (arista.tipo === "remonte") {
        const velMs = arista.velocidadRemonteMs ?? VELOCIDAD_REMONTE_DEFECTO_MS;
        const minutos = velMs > 0 ? (distH / velMs) / 60 : Infinity;
        return { distancia: distH, minutos };
    }

    // Pista: tiempo por formula de Tobler segun pendiente real
    const dZ = destino.elev - origen.elev;
    const seno = distH > 0 ? dZ / distH : 0;
    const velKmH = velocidadTobler(seno);
    const minutos = velKmH > 0 ? ((distH / 1000) / velKmH) * 60 : Infinity;
    return { distancia: distH, minutos };
}

export class GrafoRutas {
    private nodos = new Map<string, NodoRuta>();
    private adyacencia = new Map<string, AristaRuta[]>();

    agregarNodo(nodo: NodoRuta): void {
        this.nodos.set(nodo.id, nodo);
        if (!this.adyacencia.has(nodo.id)) this.adyacencia.set(nodo.id, []);
    }

    agregarArista(arista: AristaRuta): void {
        if (!this.nodos.has(arista.desde) || !this.nodos.has(arista.hasta)) {
            throw new Error(`Arista referencia nodo inexistente: ${arista.desde} -> ${arista.hasta}`);
        }
        this.adyacencia.get(arista.desde)!.push(arista);
        if (arista.tipo === "pista" || arista.bidireccional) {
            this.adyacencia.get(arista.hasta)!.push({
                ...arista,
                desde: arista.hasta,
                hasta: arista.desde
            });
        }
    }

    getNodo(id: string): NodoRuta | undefined {
        return this.nodos.get(id);
    }

    /** Dijkstra ponderado por tiempo (minutos). Devuelve null si no hay camino. */
    calcularRutaOptima(origenId: string, destinoId: string): RutaCalculada | null {
        const origen = this.nodos.get(origenId);
        const destino = this.nodos.get(destinoId);
        if (!origen || !destino) return null;

        const distancias = new Map<string, number>();
        const previos = new Map<string, { nodoId: string; arista: AristaRuta; tiempo: number; distancia: number }>();
        const visitados = new Set<string>();

        for (const id of this.nodos.keys()) distancias.set(id, Infinity);
        distancias.set(origenId, 0);

        while (visitados.size < this.nodos.size) {
            let actualId: string | null = null;
            let mejorTiempo = Infinity;
            for (const [id, t] of distancias) {
                if (!visitados.has(id) && t < mejorTiempo) {
                    mejorTiempo = t;
                    actualId = id;
                }
            }
            if (actualId === null) break;
            if (actualId === destinoId) break;

            visitados.add(actualId);
            const actual = this.nodos.get(actualId)!;

            for (const arista of this.adyacencia.get(actualId) ?? []) {
                if (visitados.has(arista.hasta)) continue;
                const vecino = this.nodos.get(arista.hasta);
                if (!vecino) continue;

                const { distancia, minutos } = tiempoArista(actual, vecino, arista);
                const nuevoTiempo = distancias.get(actualId)! + minutos;

                if (nuevoTiempo < (distancias.get(arista.hasta) ?? Infinity)) {
                    distancias.set(arista.hasta, nuevoTiempo);
                    previos.set(arista.hasta, { nodoId: actualId, arista, tiempo: minutos, distancia });
                }
            }
        }

        if (distancias.get(destinoId) === Infinity || distancias.get(destinoId) === undefined) {
            return null;
        }

        // Reconstruir camino desde destino hasta origen
        const nodosRuta: NodoRuta[] = [destino];
        const tramos: TramoRutaCalculada[] = [];
        let cursor = destinoId;

        while (cursor !== origenId) {
            const paso = previos.get(cursor);
            if (!paso) return null; // no deberia pasar si distancia != Infinity
            const nodoAnterior = this.nodos.get(paso.nodoId)!;
            const nodoActual = this.nodos.get(cursor)!;

            tramos.unshift({
                desde: nodoAnterior,
                hasta: nodoActual,
                tipo: paso.arista.tipo,
                distanciaHorizontal: Math.round(paso.distancia * 10) / 10,
                tiempoMinutos: Math.round(paso.tiempo * 10) / 10
            });
            nodosRuta.unshift(nodoAnterior);
            cursor = paso.nodoId;
        }

        const distanciaTotal = tramos.reduce((acc, t) => acc + t.distanciaHorizontal, 0);
        const tiempoTotalMinutos = tramos.reduce((acc, t) => acc + t.tiempoMinutos, 0);

        return {
            nodos: nodosRuta,
            tramos,
            distanciaTotal: Math.round(distanciaTotal * 10) / 10,
            tiempoTotalMinutos: Math.round(tiempoTotalMinutos * 10) / 10
        };
    }
}

export interface SlopesGeoJSONFeature {
    type?: string;
    properties?: {
        name?: string;
        slopes_id?: string;
        "piste:difficulty"?: string;
        "piste:type"?: string;
        aerialway?: string;
        [key: string]: any;
    };
    geometries?: Array<{
        type: string;
        coordinates: number[][];
    }>;
}

export interface SlopesResortGeoJSON {
    source?: string;
    version?: string;
    runs?: SlopesGeoJSONFeature[];
    lifts?: SlopesGeoJSONFeature[];
    [key: string]: any;
}

/**
 * Construye un GrafoRutas topologico conectando pistas y remontes desde el GeoJSON de Slopes.
 * Agrupa extremos a menos de `toleranciaMetros` (por defecto 50m) en un mismo nodo.
 */
export function crearGrafoDesdeSlopesGeoJSON(
    data: SlopesResortGeoJSON,
    toleranciaMetros = 50
): GrafoRutas {
    const grafo = new GrafoRutas();
    const nodosRegistrados: NodoRuta[] = [];

    function obtenerOCrearNodo(coord: number[], nombreRef: string, rol: "Inicio" | "Fin"): NodoRuta {
        const [lon, lat, elev] = coord;
        for (const n of nodosRegistrados) {
            if (haversine(lon, lat, n.lon, n.lat) <= toleranciaMetros) {
                return n;
            }
        }
        const nuevoNodo: NodoRuta = {
            id: `slopes_node_${nodosRegistrados.length + 1}`,
            nombre: `${nombreRef} (${rol})`,
            lon,
            lat,
            elev: elev ?? 0
        };
        nodosRegistrados.push(nuevoNodo);
        grafo.agregarNodo(nuevoNodo);
        return nuevoNodo;
    }

    // 1. Remontes
    for (const lift of data.lifts ?? []) {
        const geoms = lift.geometries ?? [];
        if (!geoms.length) continue;
        const coords = geoms[0].coordinates;
        if (!coords || coords.length < 2) continue;

        const nombre = lift.properties?.name || "Remonte";
        const aerialway = lift.properties?.aerialway || "chair_lift";
        const origen = obtenerOCrearNodo(coords[0], nombre, "Inicio");
        const destino = obtenerOCrearNodo(coords[coords.length - 1], nombre, "Fin");

        let velMs = 4.0;
        let bidi = false;
        if (aerialway === "gondola" || aerialway === "cable_car") {
            velMs = 6.0;
            bidi = true;
        } else if (["t-bar", "platter", "rope_tow", "magic_carpet"].includes(aerialway)) {
            velMs = 2.5;
        }

        grafo.agregarArista({
            desde: origen.id,
            hasta: destino.id,
            tipo: "remonte",
            velocidadRemonteMs: velMs,
            bidireccional: bidi
        });
    }

    // 2. Pistas
    for (const run of data.runs ?? []) {
        const geoms = run.geometries ?? [];
        if (!geoms.length) continue;
        const coords = geoms[0].coordinates;
        if (!coords || coords.length < 2) continue;

        const nombre = run.properties?.name || "Pista";
        const origen = obtenerOCrearNodo(coords[0], nombre, "Inicio");
        const destino = obtenerOCrearNodo(coords[coords.length - 1], nombre, "Fin");

        grafo.agregarArista({
            desde: origen.id,
            hasta: destino.id,
            tipo: "pista"
        });
    }

    return grafo;
}

