import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analizarRutaGeoJSON } from "../turf_framework_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("analiza ruta_real.geojson y produce 4 tramos con totales coherentes", () => {
    const geojson = JSON.parse(
        readFileSync(join(__dirname, "..", "ruta_real.geojson"), "utf-8")
    );
    const resumen = analizarRutaGeoJSON(geojson);

    assert.equal(resumen.tramos.length, 4);
    assert.ok(resumen.distanciaTotal > 0);
    assert.ok(resumen.desnivelPositivo > 0);
    assert.equal(
        resumen.cargaMetabolica,
        Math.round(resumen.distanciaTotal + resumen.desnivelPositivo * 10)
    );
});

test("clasifica un tramo muy empinado como Roja y un descenso fuerte como Azul", () => {
    const geojson = {
        geometry: {
            coordinates: [
                [0, 0, 0],
                [0, 0.001, 100], // ~111m horizontal, +100m -> pendiente muy fuerte
                [0, 0.002, 80]   // descenso de 20m
            ]
        }
    };
    const resumen = analizarRutaGeoJSON(geojson);
    assert.equal(resumen.tramos[0].color, "Roja");
    assert.equal(resumen.tramos[1].color, "Azul");
});

test("tramo llano y suave se clasifica como Verde", () => {
    const geojson = {
        geometry: {
            coordinates: [
                [0, 0, 1000],
                [0, 0.01, 1010] // ~1111m horizontal, +10m -> pendiente ~0.9%
            ]
        }
    };
    const resumen = analizarRutaGeoJSON(geojson);
    assert.equal(resumen.tramos[0].color, "Verde");
});
