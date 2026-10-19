// Modulo geometrico 3D para tracks de montana GeoJSON
// Implementa Haversine + Tobler + clasificacion cromatica por pendiente

export interface Punto3D {
    lon: number;
    lat: number;
    elev: number;
}

export interface TramoAnalizado {
    indice: number;
    distanciaHorizontal: number;
    desnivel: number;
    pendientePct: number;
    velocidadTobler: number;
    tiempoMinutos: number;
    color: "Verde" | "Naranja" | "Roja" | "Azul";
}

export interface ResumenRuta {
    tramos: TramoAnalizado[];
    distanciaTotal: number;
    desnivelPositivo: number;
    tiempoTotalMinutos: number;
    cargaMetabolica: number;
}

const R_TIERRA = 6371000;

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

function clasificarColor(pendientePct: number, desnivel: number): TramoAnalizado["color"] {
    if (desnivel < -5) return "Azul";
    if (Math.abs(pendientePct) > 35) return "Roja";
    if (Math.abs(pendientePct) > 15) return "Naranja";
    return "Verde";
}

export function analizarRutaGeoJSON(geoJSONFeature: { geometry: { coordinates: number[][] } }): ResumenRuta {
    const coordenadas = geoJSONFeature.geometry.coordinates;
    const tramos: TramoAnalizado[] = [];
    let distanciaTotal = 0;
    let desnivelPositivo = 0;
    let tiempoTotal = 0;

    for (let i = 0; i < coordenadas.length - 1; i++) {
        const [lon1, lat1, elev1 = 0] = coordenadas[i];
        const [lon2, lat2, elev2 = 0] = coordenadas[i + 1];

        const distH = haversine(lon1, lat1, lon2, lat2);
        const dZ = elev2 - elev1;

        if (dZ > 0) desnivelPositivo += dZ;

        const pendientePct = distH > 0 ? (dZ / distH) * 100 : 0;
        const seno = distH > 0 ? dZ / distH : 0;
        const vel = velocidadTobler(seno);
        const tiempo = vel > 0 ? ((distH / 1000) / vel) * 60 : 0;

        distanciaTotal += distH;
        tiempoTotal += tiempo;

        tramos.push({
            indice: i + 1,
            distanciaHorizontal: Math.round(distH * 10) / 10,
            desnivel: Math.round(dZ * 10) / 10,
            pendientePct: Math.round(pendientePct * 10) / 10,
            velocidadTobler: Math.round(vel * 100) / 100,
            tiempoMinutos: Math.round(tiempo * 10) / 10,
            color: clasificarColor(pendientePct, dZ)
        });
    }

    return {
        tramos,
        distanciaTotal: Math.round(distanciaTotal * 10) / 10,
        desnivelPositivo: Math.round(desnivelPositivo),
        tiempoTotalMinutos: Math.round(tiempoTotal * 10) / 10,
        cargaMetabolica: Math.round(distanciaTotal + desnivelPositivo * 10)
    };
}
