import { test } from "vitest";
import assert from "node:assert/strict";
import { FitBinaryParser } from "../strava_fit_parser.js";

function construirBufferFIT(registros: { lat: number; lon: number; alt: number; ts: number }[]): Buffer {
    const SEMICIRCULOS_POR_GRADO = Math.pow(2, 31) / 180;
    const cabecera = Buffer.alloc(14);
    cabecera.writeUInt8(14, 0); // tamano cabecera
    cabecera.writeUInt8(16, 1); // protocolo
    cabecera.writeUInt16LE(100, 2); // perfil
    cabecera.writeUInt32LE(registros.length * 14, 4); // tamanoRegistros
    cabecera.write(".FIT", 8, "ascii");

    const cuerpo = Buffer.concat(
        registros.map((r) => {
            const b = Buffer.alloc(14);
            b.writeUInt32LE(r.ts, 0);
            b.writeInt32LE(Math.round(r.lat * SEMICIRCULOS_POR_GRADO), 4);
            b.writeInt32LE(Math.round(r.lon * SEMICIRCULOS_POR_GRADO), 8);
            b.writeUInt16LE(Math.round((r.alt + 500) * 5), 12);
            return b;
        })
    );

    return Buffer.concat([cabecera, cuerpo, Buffer.alloc(2)]);
}

test("rechaza un buffer sin firma .FIT valida", () => {
    const parser = new FitBinaryParser();
    const buffer = Buffer.alloc(16);
    assert.equal(parser.analizarArchivo(buffer), null);
});

test("parsea un FIT sintetico y produce un resumen de ruta", () => {
    const parser = new FitBinaryParser();
    const buffer = construirBufferFIT([
        { ts: 1000, lat: 37.0543, lon: -3.4812, alt: 2100 },
        { ts: 1010, lat: 37.0560, lon: -3.4795, alt: 2105 },
        { ts: 1020, lat: 37.0610, lon: -3.4750, alt: 2350 },
    ]);

    const resumen = parser.analizarArchivo(buffer);
    assert.ok(resumen !== null);
    assert.equal(resumen!.tramos.length, 2);
    assert.ok(resumen!.distanciaTotal > 0);
});

test("filtra registros con coordenadas en 0", () => {
    const parser = new FitBinaryParser();
    const buffer = construirBufferFIT([
        { ts: 1000, lat: 0, lon: 0, alt: 0 },
        { ts: 1010, lat: 37.0560, lon: -3.4795, alt: 2105 },
        { ts: 1020, lat: 37.0610, lon: -3.4750, alt: 2350 },
    ]);

    const resumen = parser.analizarArchivo(buffer);
    assert.ok(resumen !== null);
    assert.equal(resumen!.tramos.length, 1);
});
