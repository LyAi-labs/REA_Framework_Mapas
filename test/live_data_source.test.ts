import { test } from "vitest";
import assert from "node:assert/strict";
import {
    DOMINIOS_CONFIGURADOS,
    parsearRespuestaIntermaps,
    oidsCerrados,
    obtenerEstadoDominio,
    parsearRespuestaEsquiades
} from "../live_data_source.js";

test("solo Portes du Soleil esta activo; el resto esta configurado pero inactivo", () => {
    const activos = DOMINIOS_CONFIGURADOS.filter((d) => d.activo);
    assert.equal(activos.length, 1);
    assert.equal(activos[0].id, "portes-du-soleil");

    const inactivos = DOMINIOS_CONFIGURADOS.filter((d) => !d.activo);
    assert.ok(inactivos.length >= 3, "deben quedar estaciones documentadas listas para activar");
});

test("parsea el esquema real de Intermaps (lifts + slopes) a una lista homogenea", () => {
    const fixture = {
        lifts: [
            { popup: { oid: "293888", title: "E7 Schatzerlift", status: "closed" }, status: "closed" },
            { popup: { oid: "100001", title: "Telesilla Norte", status: "open" }, status: "open" }
        ],
        slopes: [
            { popup: { oid: "58679", title: "Belette", status: "open" }, status: "open" }
        ],
        lastUpdate: "2026-10-19T12:00:00Z"
    };

    const elementos = parsearRespuestaIntermaps(fixture);
    assert.equal(elementos.length, 3);
    assert.equal(elementos.filter((e) => e.tipo === "remonte").length, 2);
    assert.equal(elementos.filter((e) => e.tipo === "pista").length, 1);
});

test("ignora entradas sin oid, nombre o status (datos incompletos del feed)", () => {
    const fixture = {
        lifts: [
            { popup: { oid: "1", title: "Valido", status: "open" }, status: "open" },
            { popup: { title: "Sin oid", status: "open" }, status: "open" },
            { popup: { oid: "2", status: "open" }, status: "open" }
        ]
    };
    const elementos = parsearRespuestaIntermaps(fixture);
    assert.equal(elementos.length, 1);
    assert.equal(elementos[0].oid, "1");
});

test("oidsCerrados solo incluye closed/closed_outoforder, no in_preparation", () => {
    const elementos = parsearRespuestaIntermaps({
        lifts: [
            { popup: { oid: "1", title: "A", status: "closed" }, status: "closed" },
            { popup: { oid: "2", title: "B", status: "closed_outoforder" }, status: "closed_outoforder" },
            { popup: { oid: "3", title: "C", status: "in_preparation" }, status: "in_preparation" },
            { popup: { oid: "4", title: "D", status: "open" }, status: "open" }
        ]
    });
    const cerrados = oidsCerrados(elementos);
    assert.equal(cerrados.size, 2);
    assert.ok(cerrados.has("1"));
    assert.ok(cerrados.has("2"));
    assert.ok(!cerrados.has("3"));
    assert.ok(!cerrados.has("4"));
});

test("obtenerEstadoDominio rechaza un dominio configurado pero inactivo (alcance deliberado)", async () => {
    await assert.rejects(
        () => obtenerEstadoDominio("skiwelt"),
        /no activo/
    );
});

test("obtenerEstadoDominio rechaza un dominio no configurado en absoluto", async () => {
    await assert.rejects(
        () => obtenerEstadoDominio("estacion-inventada"),
        /no configurado/
    );
});

test("parsea telemetria real de estacion Lumiplan (Courchevel / Mountain Live)", async () => {
    const { parsearRespuestaLumiplan } = await import("../live_data_source.js");
    const fixture = {
        statut: 0,
        tempStation: 13,
        tempAltitude: 5,
        hauteurNeigeStation: 10,
        hauteurNeigeAltitude: 65,
        hauteurNeigeFraiche: 5,
        nbPistesTotal: 109,
        nbPistesOuvertes: 85,
        nbRemonteesTotal: 57,
        nbRemonteesOuvertes: 50,
        nomStation: "Courchevel"
    };

    const telemetria = parsearRespuestaLumiplan(3, fixture);
    assert.equal(telemetria.estacionId, 3);
    assert.equal(telemetria.nombre, "Courchevel");
    assert.equal(telemetria.tempValle, 13);
    assert.equal(telemetria.tempCima, 5);
    assert.equal(telemetria.nieveCimaCm, 65);
    assert.equal(telemetria.pistasTotal, 109);
    assert.equal(telemetria.pistasAbiertas, 85);
    assert.equal(telemetria.remonteesTotal, 57);
    assert.equal(telemetria.remonteesAbiertos, 50);
    assert.equal(telemetria.porcentajePistasAbiertas, 78);
    assert.equal(telemetria.porcentajeRemonteesAbiertos, 88);
});

test("parsearRespuestaEsquiades normaliza partes de nieve y webcams en vivo", () => {
    const mockBaqueira = {
        id: 11,
        nombre: "Baqueira Beret",
        estado: {
            pista_id: 11,
            km_esquiables_actual: 45.5,
            km_esquiables_total: 173,
            tipo_nieve: "Polvo",
            pistas_abiertas_actual: 35,
            pistas_abiertas_total: 131,
            fecha_ultima_nevada: "2026-10-19",
            cm_ultima_nevada: 64,
            abierta: true,
            pistas_verdes_abiertas: 4,
            pistas_azules_abiertas: 15,
            pistas_rojas_abiertas: 12,
            pistas_negras_abiertas: 4,
            grueso_nieve: "40 - 120",
            open_ski_lifts: 22,
            total_ski_lifts: 36,
            texto_apertura: "Estación abierta"
        },
        webcam: [
            {
                id: "3244",
                url: "https://content.esquiades.com/rs/900/600/img/pistes/11/webcams/webcam_107.jpg",
                url_panoramica: "https://content.esquiades.com/img/pistes/11/webcams/webcam_107.jpg",
                texto_ubicacion: "Bonaigua",
                fecha_actualizacion: "2026-10-19 17:30:41",
                tipo: "panoramica"
            }
        ]
    };

    const parte = parsearRespuestaEsquiades(mockBaqueira);
    assert.equal(parte.estacionId, 11);
    assert.equal(parte.nombre, "Baqueira Beret");
    assert.equal(parte.abierta, true);
    assert.equal(parte.kmEsquiablesActual, 45.5);
    assert.equal(parte.kmEsquiablesTotal, 173);
    assert.equal(parte.tipoNieve, "Polvo");
    assert.equal(parte.pistasAbiertas, 35);
    assert.equal(parte.pistasTotal, 131);
    assert.equal(parte.remontesAbiertos, 22);
    assert.equal(parte.remontesTotal, 36);
    assert.equal(parte.cmUltimaNevada, 64);
    assert.equal(parte.webcams.length, 1);
    assert.equal(parte.webcams[0].textoUbicacion, "Bonaigua");
    assert.equal(parte.webcams[0].url, "https://content.esquiades.com/img/pistes/11/webcams/webcam_107.jpg");
});

