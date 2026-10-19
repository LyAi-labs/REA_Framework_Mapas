// Adaptador para la red de enrutamiento y topologia de Ski amade (Austria)
// Extraido por ingenieria inversa del motor RealityMaps (assets/routing/routing_graph*.csv).
// Contiene 1.245 vertices y 2.142 aristas cubriendo Flachau, Wagrain, Schladming, Gastein y Hochkonig.

import { GrafoRutas, type NodoRuta, type TipoArista } from "./graph_router.js";

export interface VerticeSkiAmade {
    id: string;
    lon: number;
    lat: number;
}

export interface AristaSkiAmade {
    dbId: string;
    difficulty: string; // "0" = remonte, "1" = azul, "2" = roja, "3" = negra, "999999" = skiroute
    name: string;
    source: string;
    target: string;
    startElev: number;
    endElev: number;
    length: number;
    cost1: number; // Coste principiante
    cost2: number; // Coste intermedio
    cost3: number; // Coste experto
}

export function parsearVerticesCSV(csvContent: string): Map<string, VerticeSkiAmade> {
    const vertices = new Map<string, VerticeSkiAmade>();
    const lines = csvContent.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Formato: "id",lon,lat
        const parts = line.split(",");
        if (parts.length < 3) continue;
        const id = parts[0].replace(/"/g, "").trim();
        const lon = parseFloat(parts[1]);
        const lat = parseFloat(parts[2]);
        if (!isNaN(lon) && !isNaN(lat)) {
            vertices.set(id, { id, lon, lat });
        }
    }
    return vertices;
}

export function parsearAristasCSV(csvContent: string): AristaSkiAmade[] {
    const aristas: AristaSkiAmade[] = [];
    const lines = csvContent.split(/\r?\n/);
    // db_id,difficulty,duration,duration_1,r_cost_1,r_cost_2,r_cost_3,cost_1,cost_2,cost_3,de_name,r_length,length,r_rev_c,rev_c,open,start_z,end_z,r_id,source,target
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",");
        if (cols.length < 21) continue;

        const dbId = cols[0].replace(/"/g, "");
        const difficulty = cols[1].replace(/"/g, "");
        const cost1 = parseFloat(cols[7]) || 0;
        const cost2 = parseFloat(cols[8]) || 0;
        const cost3 = parseFloat(cols[9]) || 0;
        const name = cols[10].replace(/"/g, "").trim();
        const length = parseFloat(cols[12]) || 0;
        const startElev = parseFloat(cols[16]) || 0;
        const endElev = parseFloat(cols[17]) || 0;
        const source = cols[19].replace(/"/g, "").trim();
        const target = cols[20].replace(/"/g, "").trim();

        aristas.push({
            dbId,
            difficulty,
            name,
            source,
            target,
            startElev,
            endElev,
            length,
            cost1,
            cost2,
            cost3
        });
    }
    return aristas;
}

export function crearGrafoSkiAmade(
    verticesCsv: string,
    aristasCsv: string,
    filtroNivel?: 1 | 2 | 3
): { grafo: GrafoRutas; aristasCargadas: number; verticesCargados: number } {
    const vertices = parsearVerticesCSV(verticesCsv);
    const aristas = parsearAristasCSV(aristasCsv);
    const grafo = new GrafoRutas();

    // 1. Registrar nodos
    for (const v of vertices.values()) {
        const nodo: NodoRuta = {
            id: v.id,
            nombre: `SkiAmade #${v.id}`,
            lon: v.lon,
            lat: v.lat,
            elev: 0 // Se enriquecera con startElev/endElev de aristas
        };
        grafo.agregarNodo(nodo);
    }

    let aristasCargadas = 0;

    // 2. Conectar aristas
    for (const a of aristas) {
        if (!vertices.has(a.source) || !vertices.has(a.target)) continue;

        // Actualizar elevaciones reales en los nodos
        const nodoSource = grafo.getNodo(a.source);
        if (nodoSource && a.startElev > 0) nodoSource.elev = a.startElev;
        const nodoTarget = grafo.getNodo(a.target);
        if (nodoTarget && a.endElev > 0) nodoTarget.elev = a.endElev;

        // Si dificultad es "0" -> Remonte. "999999" -> Skiroute fuera pista. "1","2","3" -> Pistas
        const esRemonte = a.difficulty === "0";
        const tipo: TipoArista = esRemonte ? "remonte" : "pista";

        // Si es remonte, fijamos velocidad promedio tipica (4.5 m/s)
        grafo.agregarArista({
            desde: a.source,
            hasta: a.target,
            tipo,
            velocidadRemonteMs: esRemonte ? 4.5 : undefined,
            bidireccional: esRemonte && a.name.toLowerCase().includes("bahn") // telecabinas
        });

        aristasCargadas++;
    }

    return {
        grafo,
        aristasCargadas,
        verticesCargados: vertices.size
    };
}

export function exportarSkiAmadeAGeoJSON(
    verticesCsv: string,
    aristasCsv: string,
    limite = 200
): any {
    const vertices = parsearVerticesCSV(verticesCsv);
    const aristas = parsearAristasCSV(aristasCsv);

    const features = [];
    const aristasAExportar = limite > 0 ? aristas.slice(0, limite) : aristas;

    for (const a of aristasAExportar) {
        const v1 = vertices.get(a.source);
        const v2 = vertices.get(a.target);
        if (!v1 || !v2) continue;

        const esRemonte = a.difficulty === "0";
        features.push({
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [
                    [v1.lon, v1.lat, a.startElev],
                    [v2.lon, v2.lat, a.endElev]
                ]
            },
            properties: {
                id: a.dbId,
                name: a.name,
                difficulty: a.difficulty,
                type: esRemonte ? "remonte" : "pista",
                length_m: a.length,
                start_z: a.startElev,
                end_z: a.endElev
            }
        });
    }

    return {
        type: "FeatureCollection",
        features
    };
}
