#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import {
    parsearGPX,
    parsearFIT,
    analizarTrack,
    formatearReporteTelegramMarkdown,
    type PuntoGPS
} from "./track_analyzer.js";

function main() {
    const args = process.argv.slice(2);
    if (!args.length) {
        console.error("Uso: node dist/analizar_track_cli.js <ruta_archivo.gpx|.fit> [--markdown]");
        process.exit(1);
    }

    const filePath = resolve(args[0]);
    const markdownMode = args.includes("--markdown");

    if (!existsSync(filePath)) {
        console.error(`Error: el archivo no existe: ${filePath}`);
        process.exit(1);
    }

    const fn = basename(filePath);
    let puntos: PuntoGPS[] = [];

    if (/\.fit$/i.test(fn)) {
        const buf = readFileSync(filePath);
        puntos = parsearFIT(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    } else {
        const txt = readFileSync(filePath, "utf-8");
        puntos = parsearGPX(txt);
    }

    const reporte = analizarTrack(puntos, fn);

    if (markdownMode) {
        console.log(formatearReporteTelegramMarkdown(reporte));
    } else {
        console.log(JSON.stringify(reporte, null, 2));
    }
}

main();
