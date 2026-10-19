import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
    parsearGPX,
    parsearFIT,
    analizarTrack,
    formatearReporteTelegramMarkdown,
    type PuntoGPS
} from "../track_analyzer.js";

function construirBufferFITSintetico(registros: { lat: number; lon: number; alt: number; ts: number }[]): Buffer {
    const SEMICIRCULOS_POR_GRADO = Math.pow(2, 31) / 180;
    const cabecera = Buffer.alloc(14);
    cabecera.writeUInt8(14, 0);
    cabecera.writeUInt8(16, 1);
    cabecera.writeUInt16LE(100, 2);
    cabecera.writeUInt32LE(registros.length * 16, 4);
    cabecera.write(".FIT", 8, "ascii");

    const cuerpo = Buffer.concat(
        registros.map((r) => {
            const b = Buffer.alloc(16);
            b.writeUInt32LE(r.ts, 0);
            b.writeInt32LE(Math.round(r.lat * SEMICIRCULOS_POR_GRADO), 4);
            b.writeInt32LE(Math.round(r.lon * SEMICIRCULOS_POR_GRADO), 8);
            b.writeUInt16LE(Math.round((r.alt + 500) * 5), 12);
            return b;
        })
    );

    return Buffer.concat([cabecera, cuerpo, Buffer.alloc(2)]);
}

test("parsearGPX extrae puntos y altitudes de garmin_track.gpx", async () => {
    const gpxRaw = await readFile(new URL("../garmin_track.gpx", import.meta.url), "utf-8");
    const puntos = parsearGPX(gpxRaw);

    assert.equal(puntos.length, 2);
    assert.equal(puntos[0].lat, 37.0543);
    assert.equal(puntos[0].lon, -3.4812);
    assert.equal(puntos[0].alt, 2100.0);
    assert.equal(puntos[1].alt, 2105.0);
});

test("analizarTrack calcula metricas de subida, bajada, duracion y formato", () => {
    // Generar un track simulando un esquiador:
    // 1. Sube en remonte de 1500m a 2200m (ascenso de +700m)
    // 2. Baja esquiando de 2200m a 1500m (descenso de -700m a alta velocidad)
    const puntos: PuntoGPS[] = [];
    const t0 = 1700000000000;

    // Subida (10 puntos cada 30 segundos, ganando altura)
    for (let i = 0; i <= 10; i++) {
        puntos.push({
            lat: 46.1800 + i * 0.001,
            lon: 6.7400 + i * 0.0005,
            alt: 1500 + i * 70,
            timestampMs: t0 + i * 30000
        });
    }

    // Bajada (10 puntos cada 10 segundos, perdiendo altura rapido)
    for (let i = 1; i <= 10; i++) {
        puntos.push({
            lat: 46.1900 - i * 0.001,
            lon: 6.7450 - i * 0.0005,
            alt: 2200 - i * 70,
            timestampMs: t0 + 300000 + i * 10000
        });
    }

    const reporte = analizarTrack(puntos, "dia_esqui.gpx");

    assert.equal(reporte.formato, "GPX");
    assert.equal(reporte.totalPuntos, 21);
    assert.equal(reporte.cotaMinM, 1500);
    assert.equal(reporte.cotaMaxM, 2200);
    assert.ok(reporte.distanciaTotalKm > 0);
    assert.ok(reporte.desnivelPositivoM >= 680);
    assert.ok(reporte.desnivelNegativoM >= 680);
    assert.ok(reporte.velocidadMaxKmH > 20);

    // Debe detectar al menos 1 remonte y 1 bajada
    assert.ok(reporte.resumenSegmentos.totalRemontes >= 1);
    assert.ok(reporte.resumenSegmentos.totalBajadas >= 1);

    // El formateador Telegram Markdown genera un texto legible
    const md = formatearReporteTelegramMarkdown(reporte);
    assert.ok(md.includes("Telemetría de Actividad en Montaña"));
    assert.ok(md.includes("dia_esqui.gpx"));
    assert.ok(md.includes("Bajadas"));
    assert.ok(md.includes("Remontes"));
});

test("parsearFIT procesa correctamente un buffer binario .FIT", () => {
    const buf = construirBufferFITSintetico([
        { ts: 1000, lat: 46.180, lon: 6.740, alt: 1800 },
        { ts: 1010, lat: 46.182, lon: 6.742, alt: 1850 },
        { ts: 1020, lat: 46.185, lon: 6.745, alt: 1900 }
    ]);

    const puntos = parsearFIT(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    assert.equal(puntos.length, 3);
    assert.ok(Math.abs(puntos[0].lat - 46.180) < 0.001);
    assert.ok(Math.abs(puntos[0].alt - 1800) < 2);
});
