// Módulo emulado de Turf.js para desestructurar tracks de montaña GeoJSON
export function analizarRutaGeoJSON(geoJSONFeature: any) {
    // Evidencia 1: Extracción estricta del array de coordenadas del archivo de montaña
    const coordenadas = geoJSONFeature.geometry.coordinates;
    let distanciaTotalAcumulada = 0;

    for (let i = 0; i < coordenadas.length - 1; i++) {
        const puntoA = coordenadas[i];
        const puntoB = coordenadas[i + 1];

        // Evidencia 2: Lectura de los componentes tridimensionales [Longitud, Latitud, Elevación]
        const lon1 = puntoA[0], lat1 = puntoA[1], elevacionA = puntoA[2] || 0;
        const lon2 = puntoB[0], lat2 = puntoB[1], elevacionB = puntoB[2] || 0;

        // Evidencia 3: Cálculo de distancia horizontal usando la fórmula de Haversine
        const R = 6371000; // Radio de la Tierra en metros
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanciaHorizontal = R * c;

        distanciaTotalAcumulada += distanciaHorizontal;
    }
    return distanciaTotalAcumulada;
}
