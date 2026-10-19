import { test } from "vitest";
import assert from "node:assert/strict";
import {
    clasificarSegmento,
    PuntoGPS,
    LineaRemonteConocida
} from "../slopes_segment_classifier.js";

test("clasifica correctamente una bajada de esqui (RUN)", () => {
    // Esquiando cuesta abajo: de 2200m a 1700m (-500m de desnivel) a 12 m/s (~43 km/h)
    const puntos: PuntoGPS[] = [];
    const t0 = 1700000000000;
    for (let i = 0; i < 20; i++) {
        puntos.push({
            lat: 46.20 + (i * 0.001),
            lon: 6.85 + (i * 0.001),
            alt: 2200 - (i * 25), // -500m
            timestampMs: t0 + (i * 10000), // cada 10 seg
            velocidadMs: 12.0
        });
    }

    const res = clasificarSegmento(puntos);
    assert.equal(res.tipo, "RUN");
    assert.ok(res.desnivelM < 0);
    assert.ok(res.distanciaTotalM > 100);
});

test("clasifica correctamente una subida en telesilla (LIFT)", () => {
    // Subiendo en remonte: de 1600m a 2100m (+500m) a 4 m/s
    const puntos: PuntoGPS[] = [];
    const t0 = 1700000000000;
    for (let i = 0; i < 20; i++) {
        puntos.push({
            lat: 46.20 + (i * 0.0005),
            lon: 6.85 + (i * 0.0005),
            alt: 1600 + (i * 25), // +500m
            timestampMs: t0 + (i * 15000), // cada 15 seg
            velocidadMs: 4.0
        });
    }

    const res = clasificarSegmento(puntos);
    assert.equal(res.tipo, "LIFT");
    assert.ok(res.desnivelM > 0);
});

test("aplica correccion de proximidad (<70m) a un remonte conocido del mapa", () => {
    const remonteChampeys: LineaRemonteConocida = {
        id: "lift_1",
        nombre: "TSD Champeys",
        coords: [
            [6.8500, 46.2000],
            [6.8550, 46.2050]
        ]
    };

    const puntos: PuntoGPS[] = [
        { lat: 46.2001, lon: 6.8501, alt: 1600, timestampMs: 1700000000000 },
        { lat: 46.2049, lon: 6.8549, alt: 1850, timestampMs: 1700000180000 }
    ];

    const res = clasificarSegmento(puntos, [remonteChampeys]);
    assert.equal(res.tipo, "LIFT");
    assert.equal(res.remonteCoincidente, "TSD Champeys");
    assert.match(res.motivoClasificacion, /proximidad/i);
});

test("reclasifica a senderismo / travesia (USER_ASCENT) segun formula matematica de Slopes", () => {
    // Condiciones P3/v.java:
    // tipo == LIFT, sin remonte coincidente, distancia > 100m, desnivel >= 25m,
    // (desnivel / distancia) < 0.15, velMedia <= 2.5 m/s, duracion >= 240s
    const puntos: PuntoGPS[] = [];
    const t0 = 1700000000000;
    const n = 30;
    for (let i = 0; i < n; i++) {
        puntos.push({
            lat: 46.2200 + (i * 0.0002), // ~600m distancia total
            lon: 6.8800 + (i * 0.0002),
            alt: 1800 + (i * 1.5), // +45m desnivel (45/780 = 0.057 < 0.15)
            timestampMs: t0 + (i * 15000), // 435 seg total (>240s)
            velocidadMs: 1.8 // ritmo de foqueo/a pie (1.8 m/s <= 2.5 m/s)
        });
    }

    const res = clasificarSegmento(puntos, []); // sin remontes conocidos
    assert.equal(res.tipo, "USER_ASCENT");
    assert.match(res.motivoClasificacion, /senderismo/i);
});

test("detecta viajes en automovil / autobus (DriveDetector)", () => {
    const puntos: PuntoGPS[] = [
        { lat: 46.2000, lon: 6.8000, alt: 950, timestampMs: 1700000000000, velocidadMs: 30.0 }, // ~108 km/h
        { lat: 46.2500, lon: 6.8500, alt: 955, timestampMs: 1700000100000, velocidadMs: 32.0 }
    ];

    const res = clasificarSegmento(puntos);
    assert.equal(res.tipo, "DRIVE");
    assert.match(res.motivoClasificacion, /DriveDetector/i);
});
