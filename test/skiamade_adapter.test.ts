import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
    parsearVerticesCSV,
    parsearAristasCSV,
    crearGrafoSkiAmade,
    exportarSkiAmadeAGeoJSON
} from "../skiamade_adapter.js";

const VERTICES_PATH = new URL("../decompiled/skiamade/assets/routing/routing_graph_vertex_pos.csv", import.meta.url);
const ARISTAS_PATH = new URL("../decompiled/skiamade/assets/routing/routing_graph.csv", import.meta.url);

test("parsearVerticesCSV extrae correctamente vertices con coordenadas WGS84", async () => {
    const raw = await readFile(VERTICES_PATH, "utf-8");
    const vertices = parsearVerticesCSV(raw);

    assert.ok(vertices.size > 1000, `Debe haber mas de 1000 vertices (total: ${vertices.size})`);
    const v2 = vertices.get("2");
    assert.ok(v2);
    assert.equal(v2!.id, "2");
    assert.ok(v2!.lon > 12.0 && v2!.lon < 14.0, "Longitud en Salzburgo / Estiria");
    assert.ok(v2!.lat > 46.5 && v2!.lat < 48.0, "Latitud en los Alpes austriacos");
});

test("parsearAristasCSV extrae remontes, pistas y niveles de coste", async () => {
    const raw = await readFile(ARISTAS_PATH, "utf-8");
    const aristas = parsearAristasCSV(raw);

    assert.ok(aristas.length > 2000, `Debe haber mas de 2000 aristas (total: ${aristas.length})`);
    
    // Comprobar que existen remontes ("0"), pistas azules ("1"), rojas ("2") y skiroutes ("999999")
    const remontes = aristas.filter(a => a.difficulty === "0");
    const azules = aristas.filter(a => a.difficulty === "1");
    const rojas = aristas.filter(a => a.difficulty === "2");
    const skiroutes = aristas.filter(a => a.difficulty === "999999");

    assert.ok(remontes.length > 200, "Debe haber mas de 200 tramos de remonte");
    assert.ok(azules.length > 700, "Debe haber mas de 700 tramos azules");
    assert.ok(rojas.length > 700, "Debe haber mas de 700 tramos rojos");
    assert.ok(skiroutes.length > 50, "Debe haber skiroutes / itinerarios fuera de pista");
});

test("crearGrafoSkiAmade construye el GrafoRutas y permite calcular ruta Dijkstra en Austria", async () => {
    const vRaw = await readFile(VERTICES_PATH, "utf-8");
    const aRaw = await readFile(ARISTAS_PATH, "utf-8");

    const { grafo, verticesCargados, aristasCargadas } = crearGrafoSkiAmade(vRaw, aRaw);
    assert.ok(verticesCargados > 1000);
    assert.ok(aristasCargadas > 1500);

    // Seleccionamos un par de nodos conectados por una pista conocida (ej. Fellersbachabfahrt: 171 -> 174 -> 203)
    const ruta = grafo.calcularRutaOptima("171", "203");
    assert.ok(ruta !== null, "Debe encontrar camino continuo sobre la pista Fellersbachabfahrt");
    assert.ok(ruta!.distanciaTotal > 0);
    assert.ok(ruta!.tiempoTotalMinutos > 0);
    assert.ok(ruta!.tramos.length >= 2);
});

test("exportarSkiAmadeAGeoJSON genera un FeatureCollection valido con altitudes", async () => {
    const vRaw = await readFile(VERTICES_PATH, "utf-8");
    const aRaw = await readFile(ARISTAS_PATH, "utf-8");

    const geojson = exportarSkiAmadeAGeoJSON(vRaw, aRaw, 25);
    assert.equal(geojson.type, "FeatureCollection");
    assert.equal(geojson.features.length, 25);
    assert.equal(geojson.features[0].geometry.type, "LineString");
    assert.equal(geojson.features[0].geometry.coordinates[0].length, 3, "Coordenadas [lon, lat, elev]");
});
