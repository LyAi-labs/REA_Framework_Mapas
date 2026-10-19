// Parser de archivos FIT (Garmin/Strava) a coordenadas 3D
// Convierte registros binarios FIT a formato compatible con el motor geometrico

import { analizarRutaGeoJSON, ResumenRuta } from "./turf_framework_core";

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

export class FitBinaryParser {

    parsearCabecera(buffer: Buffer): CabeceraFIT {
        return {
            tamano: buffer.readUInt8(0),
            protocolo: buffer.readUInt8(1),
            perfil: buffer.readUInt16LE(2),
            tamanoRegistros: buffer.readUInt32LE(4),
            firma: buffer.toString("ascii", 8, 12)
        };
    }

    parsearRegistro(buffer: Buffer, offset: number): RegistroFIT {
        return {
            timestamp: buffer.readUInt32LE(offset),
            latitud: buffer.readInt32LE(offset + 4) * SEMICIRCULOS_A_GRADOS,
            longitud: buffer.readInt32LE(offset + 8) * SEMICIRCULOS_A_GRADOS,
            altitud: (buffer.readUInt16LE(offset + 12) / 5) - 500
        };
    }

    parsearTodosLosRegistros(buffer: Buffer, offsetInicial: number, tamanoRegistro: number): RegistroFIT[] {
        const registros: RegistroFIT[] = [];
        let offset = offsetInicial;

        while (offset + tamanoRegistro <= buffer.length - 2) {
            const reg = this.parsearRegistro(buffer, offset);

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

    analizarArchivo(buffer: Buffer, tamanoRegistro: number = 14): ResumenRuta | null {
        const cabecera = this.parsearCabecera(buffer);

        if (cabecera.firma !== ".FIT") {
            console.error("Archivo no es formato FIT valido");
            return null;
        }

        const registros = this.parsearTodosLosRegistros(buffer, cabecera.tamano, tamanoRegistro);

        if (registros.length < 2) {
            console.error("No hay suficientes puntos GPS en el archivo");
            return null;
        }

        const geojson = this.registrosAGeoJSON(registros);
        return analizarRutaGeoJSON(geojson);
    }
}
