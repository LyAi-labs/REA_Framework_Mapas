// Parser de archivos FIT (Garmin/Strava) a coordenadas 3D
// Convierte registros binarios FIT a formato compatible con el motor geometrico
//
// Usa DataView/Uint8Array (no Buffer de Node) para poder ejecutarse igual en
// Node (tests) y en el navegador (lectura de un .fit subido desde el mapa web).

import { analizarRutaGeoJSON, ResumenRuta } from "./turf_framework_core.js";

const SEMICIRCULOS_A_GRADOS = 180 / Math.pow(2, 31);

interface RegistroFIT {
    timestamp: number;
    latitud: number;
    longitud: number;
    altitud: number;
}

interface CabeceraFIT {
    tamano: number;
    protocolo: number;
    perfil: number;
    tamanoRegistros: number;
    firma: string;
}

function toUint8Array(datos: Uint8Array | ArrayBuffer): Uint8Array {
    return datos instanceof Uint8Array ? datos : new Uint8Array(datos);
}

export class FitBinaryParser {

    parsearCabecera(bytes: Uint8Array): CabeceraFIT {
        const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const firma = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        return {
            tamano: vista.getUint8(0),
            protocolo: vista.getUint8(1),
            perfil: vista.getUint16(2, true),
            tamanoRegistros: vista.getUint32(4, true),
            firma
        };
    }

    parsearRegistro(bytes: Uint8Array, offset: number): RegistroFIT {
        const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return {
            timestamp: vista.getUint32(offset, true),
            latitud: vista.getInt32(offset + 4, true) * SEMICIRCULOS_A_GRADOS,
            longitud: vista.getInt32(offset + 8, true) * SEMICIRCULOS_A_GRADOS,
            altitud: (vista.getUint16(offset + 12, true) / 5) - 500
        };
    }

    parsearTodosLosRegistros(bytes: Uint8Array, offsetInicial: number, tamanoRegistro: number): RegistroFIT[] {
        const registros: RegistroFIT[] = [];
        let offset = offsetInicial;

        while (offset + tamanoRegistro <= bytes.length - 2) {
            const reg = this.parsearRegistro(bytes, offset);

            // Filtrar registros invalidos (coordenadas en 0 o fuera de rango)
            if (reg.latitud !== 0 && reg.longitud !== 0 &&
                Math.abs(reg.latitud) <= 90 && Math.abs(reg.longitud) <= 180) {
                registros.push(reg);
            }

            offset += tamanoRegistro;
        }

        return registros;
    }

    registrosAGeoJSON(registros: RegistroFIT[]): { geometry: { coordinates: number[][] } } {
        return {
            geometry: {
                coordinates: registros.map(r => [r.longitud, r.latitud, r.altitud])
            }
        };
    }

    analizarArchivo(datos: Uint8Array | ArrayBuffer, tamanoRegistro: number = 14): ResumenRuta | null {
        const bytes = toUint8Array(datos);

        if (bytes.length < 14) {
            console.error("Archivo demasiado pequeno para ser un FIT valido");
            return null;
        }

        const cabecera = this.parsearCabecera(bytes);

        if (cabecera.firma !== ".FIT") {
            console.error("Archivo no es formato FIT valido");
            return null;
        }

        const registros = this.parsearTodosLosRegistros(bytes, cabecera.tamano, tamanoRegistro);

        if (registros.length < 2) {
            console.error("No hay suficientes puntos GPS en el archivo");
            return null;
        }

        const geojson = this.registrosAGeoJSON(registros);
        return analizarRutaGeoJSON(geojson);
    }

    /** Como analizarArchivo, pero devuelve el GeoJSON de coordenadas en vez del resumen ya calculado. */
    archivoAGeoJSON(datos: Uint8Array | ArrayBuffer, tamanoRegistro: number = 14): { geometry: { coordinates: number[][] } } | null {
        const bytes = toUint8Array(datos);

        if (bytes.length < 14) return null;

        const cabecera = this.parsearCabecera(bytes);
        if (cabecera.firma !== ".FIT") return null;

        const registros = this.parsearTodosLosRegistros(bytes, cabecera.tamano, tamanoRegistro);
        if (registros.length < 2) return null;

        return this.registrosAGeoJSON(registros);
    }
}
