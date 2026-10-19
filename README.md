# REA Framework Mapas - Motor Geometrico Autonomo 3D

Motor de analisis topografico 3D para rutas de montana. Calcula distancias (Haversine), velocidades de marcha (Tobler) y clasifica tramos por pendiente con codigo cromatico.

## Componentes

| Archivo | Descripcion |
|---|---|
| `HerramientaAutonoma3D.ps1` | Script PowerShell principal: analiza 5 puntos 3D y clasifica cada tramo |
| `index.html` | Interfaz web Leaflet interactiva con red de Dents du Midi (70 pistas, 27 remontes), enrutador Dijkstra, selector multirregión y visor de telemetría |
| `graph_router.ts` | Calculador de rutas Dijkstra ponderado con fórmula de Tobler para pistas y velocidades físicas de remontes |
| `slopes_segment_classifier.ts` | Clasificador de segmentos de nieve según algoritmos de Slopes (LIFT, RUN, USER_ASCENT, DRIVE) |
| `skiamade_adapter.ts` | Adaptador del grafo austriaco de Ski amadé extraído de RealityMaps (1.245 vértices y 2.142 aristas) |
| `live_data_source.ts` | Proveedor multirred de partes de nieve y webcams en vivo (Intermaps, Lumiplan, Esquiades) |
| `track_analyzer.ts` | Motor de análisis integral de tracks GPS (.GPX / .FIT) con segmentación continua de bajadas y remontes |
| `analizar_track_cli.ts` | CLI ejecutable conectado al bot de Telegram (`bridge.py`) para procesar tracks al vuelo |
| `strava_fit_parser.ts` | Parser de archivos FIT (Garmin/Strava), implementado sobre `DataView`/`Uint8Array` para correr en Node y navegador |
| `dents_du_midi_pistes.json` | Red topológica vectorial de Champéry / Dents du Midi extraída de Slopes API |

## Clasificacion cromatica de pendientes

| Color | Condicion | Significado |
|---|---|---|
| Verde | Pendiente < 15% | Terreno seguro |
| Naranja | Pendiente 15-35% | Pendiente moderada |
| Rojo | Pendiente > 35% | Muro tecnico peligroso |
| Azul | Descenso > 5m | Descenso tecnico |

## Uso

### Script PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File HerramientaAutonoma3D.ps1
```

### Mapa web local

El mapa (`index.html`) importa el nucleo geometrico como modulo ES compilado, asi que hay que compilar antes de servir:

```bash
cd REA_Framework_Mapas
npm install
npm run build        # compila *.ts a dist/
python -m http.server 8000
```

Abrir http://localhost:8000 en el navegador. El mapa carga la ruta por defecto y permite subir archivos GeoJSON 3D desde la barra lateral.

### Tests

```bash
npm test          # una pasada (Vitest)
npm run test:watch   # modo watch, se re-ejecuta en cada cambio de archivo .ts
```

En el servidor de produccion, `test:watch` corre bajo **PM2** (proceso `rea-mapas-test-watch`,
`ecosystem.config.cjs`) para certificar automaticamente cada cambio en los motores
topograficos (`turf_framework_core.ts`, `strava_fit_parser.ts`) sin lanzar el comando a mano:

```bash
pm2 status rea-mapas-test-watch     # ver estado
pm2 logs rea-mapas-test-watch       # ver resultado de la ultima ejecucion
pm2 restart rea-mapas-test-watch    # reiniciar
pm2 start ecosystem.config.cjs      # (re)lanzar si no esta corriendo
```

⚠️ `pm2 startup` (arranque automatico tras reboot del servidor, requiere systemd a nivel de
sistema) no se ha configurado — bloqueado por el clasificador de auto-mode de Claude Code
("Unauthorized Persistence"). Si el servidor reinicia, hay que relanzarlo a mano con
`pm2 resurrect` o `pm2 start ecosystem.config.cjs`.

## Formulas utilizadas

- **Haversine**: distancia horizontal entre coordenadas GPS sobre la esfera terrestre
- **Tobler**: `V = 6 * exp(-3.5 * |pendiente + 0.05|)` — velocidad de marcha en km/h segun inclinacion del terreno
- **Carga metabolica**: `distancia_plana + (desnivel_positivo * 10)` — esfuerzo equivalente en metros de llano
