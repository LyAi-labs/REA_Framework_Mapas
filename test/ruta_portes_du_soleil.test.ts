import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analizarRutaGeoJSON } from "../turf_framework_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function cargarRuta() {
    const geojson = JSON.parse(
        readFileSync(join(__dirname, "..", "ruta_portes_du_soleil.geojson"), "utf-8")
    );
    return analizarRutaGeoJSON(geojson);
}

test("procesa el track Avoriaz - Chavanette - Morzine con 12 tramos", () => {
    const resumen = cargarRuta();
    assert.equal(resumen.tramos.length, 12);
    assert.ok(resumen.distanciaTotal > 7000, "la ruta alpina debe superar los 7km");
    assert.ok(resumen.desnivelPositivo > 0);
});

test("el tramo de subida hacia Pas de Chavanette se clasifica como Naranja (pendiente moderada)", () => {
    const resumen = cargarRuta();
    assert.equal(resumen.tramos[2].color, "Naranja");
    assert.ok(resumen.tramos[2].pendientePct > 15);
});

test("el muro de Chavanette (tramos 5 y 6) marca el descenso mas pronunciado de la ruta", () => {
    const resumen = cargarRuta();
    const pendientesAbsolutas = resumen.tramos.map((t) => Math.abs(t.pendientePct));
    const maxPendiente = Math.max(...pendientesAbsolutas);
    assert.equal(resumen.tramos[4].color, "Azul");
    assert.equal(maxPendiente, Math.abs(resumen.tramos[4].pendientePct));
    assert.ok(maxPendiente > 50, "el muro debe superar el 50% de pendiente");
});
