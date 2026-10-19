# REA Framework Mapas - Motor Geometrico Autonomo 3D

Motor de analisis topografico 3D para rutas de montana. Calcula distancias (Haversine), velocidades de marcha (Tobler) y clasifica tramos por pendiente con codigo cromatico.

## Componentes

| Archivo | Descripcion |
|---|---|
| `HerramientaAutonoma3D.ps1` | Script PowerShell principal: analiza 5 puntos 3D y clasifica cada tramo |
| `index.html` | Interfaz web con mapa Leaflet + OpenTopoMap para visualizar rutas |
| `ruta_real.geojson` | Archivo GeoJSON 3D de prueba (Sierra Nevada) |
| `EjecutarMotor3D.ps1` | Motor de ejecucion 3D |
| `SuperMotorMontana.ps1` | Motor extendido de montana |
| `garmin_track.gpx` | Track GPS de ejemplo en formato GPX |
| `turf_framework_core.ts` | Nucleo del framework geoespacial en TypeScript |
| `strava_fit_parser.ts` | Parser de archivos FIT de Strava |

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

```bash
cd REA_Framework_Mapas
python -m http.server 8000
```

Abrir http://localhost:8000 en el navegador. El mapa carga la ruta por defecto y permite subir archivos GeoJSON 3D desde la barra lateral.

## Formulas utilizadas

- **Haversine**: distancia horizontal entre coordenadas GPS sobre la esfera terrestre
- **Tobler**: `V = 6 * exp(-3.5 * |pendiente + 0.05|)` — velocidad de marcha en km/h segun inclinacion del terreno
- **Carga metabolica**: `distancia_plana + (desnivel_positivo * 10)` — esfuerzo equivalente en metros de llano
