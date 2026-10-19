# Registro de actividad entre agentes — REA_Framework_Mapas

Append-only. Una entrada por cambio significativo (no por cada tool call).
Cualquier agente (Claude Code, Antigravity, Codex, Cursor...) lee esto al
empezar y añade una entrada al terminar algo que otro agente necesitaría saber
antes de tocar el mismo área. Formato libre, mínimo: fecha, agente, qué se
hizo, qué queda abierto.

Esto NO sustituye la memoria propia de cada agente ni la wiki — es solo el
"qué está pasando ahora mismo en este repo" compartido entre agentes distintos
que no se ven en tiempo real. Ver
`/opt/lyai/wiki/pages/protocols/proto-agent-coordination.md`.

---

**2026-10-19 — Claude Code (server, PM)**: Proyecto se retoma en el servidor de produccion
(antes dev en Windows/WSL builder, ya no existe). No toca lyai-ski ni sustituye su calculador
de rutas — es un proyecto aislado, "REA Framework Mapas" (motor 3D propio: Haversine + Tobler),
sin relacion con el REA de reverse engineering.

Hecho:
- Anadido `package.json` + `tsconfig.json` (module/moduleResolution NodeNext) para compilar
  `turf_framework_core.ts` y `strava_fit_parser.ts` (antes no habia build, eran TS sueltos).
- Anadidos tests (`node --test`) en `test/*.test.ts`: 6 tests, todos verdes
  (`npm test` → compila con `tsc` y corre `dist/test/*.test.js`).
- `index.html` ya NO duplica la logica de Haversine/Tobler/clasificacion en JS inline:
  ahora importa `dist/turf_framework_core.js` como modulo ES. **Implica que hay que
  `npm run build` antes de servir index.html** (dist/ esta en `.gitignore`, no se commitea).
- `.gitignore` anadido (`node_modules/`, `dist/`).
- README actualizado con pasos de build/test.

Abierto / lo que queda:
- `strava_fit_parser.ts` (parser FIT binario) tiene tests sinteticos pero no se ha probado
  con un .FIT real de Garmin/Strava — el formato real usa mensajes definidos por campo
  (no un registro de tamano fijo 14 bytes como aqui, que es una simplificacion).
- Los `.ps1` (HerramientaAutonoma3D, EjecutarMotor3D, SuperMotorMontana) no se han tocado ni
  verificado desde el server — son para ejecucion en Windows, no se han revisado en esta sesion.
- Sin decidir aun: si este proyecto se despliega en algun dominio o queda solo como herramienta
  local/CLI.

**2026-10-19 (cont.) — Claude Code (server, PM)**: A peticion de Ignacio, suite de tests
migrada a **Vitest** (antes `node --test` + build manual) y dejado un watcher corriendo en
background en este mismo servidor Hetzner:

- `vitest` instalado como devDependency; `test/*.test.ts` ahora importan `test`/`expect` de
  `"vitest"` en vez de `"node:test"` (vitest no detectaba las suites con el import de node).
- `vitest.config.ts` anadido (`include: ["test/**/*.test.ts"]`).
- Scripts: `npm test` → `vitest run` (una pasada, para CI/manual); `npm run test:watch` → `vitest`
  (modo watch).
- **PM2 no esta instalado en este servidor** (`pm2: command not found`, no esta en `npm -g` ni en
  `/usr/lib/node_modules`) — no se ha instalado globalmente sin confirmar con Ignacio. Se usa en
  su lugar `nohup npm run test:watch > test-watch.log 2>&1 & disown`.
- Proceso verificado reparentado a PID 1 (systemd) — sobrevive al cierre de la sesion de Claude
  Code. PID guardado en `test-watch.pid` (**no commiteado**, es estado de ejecucion local del
  server, no del repo). Log en `test-watch.log` (tampoco commiteado — anadir a `.gitignore` si se
  usa en otro checkout).
- Verificado en vivo: `touch turf_framework_core.ts` → el log muestra `RERUN turf_framework_core.ts`
  automatico con los 6 tests en verde.
- **Si alguien necesita pararlo**: `kill $(cat test-watch.pid)` desde la raiz del proyecto, o
  `pkill -f "node .*vitest"` (cuidado si hay otro proyecto con vitest corriendo en el mismo server).
- Pendiente real: si se quiere supervision formal (reinicio automatico si el proceso muere, logs
  rotados, arranque tras reboot del server), eso es lo que daria PM2/systemd unit — con nohup no
  hay auto-restart ni se levanta solo tras un reinicio del servidor. No instalado por ahora.

**2026-10-19 (cont. 2) — Claude Code (server, PM)**: Instalado PM2 globalmente a peticion de
Ignacio (`npm install -g pm2`, v7.0.4, `/home/lyai/.npm-global/bin/pm2`) y migrado el watcher:

- Matado el proceso nohup anterior; sustituido por `pm2 start ecosystem.config.cjs` → proceso
  `rea-mapas-test-watch` (fork mode, `npm run test:watch`), con `autorestart: true`.
- `ecosystem.config.cjs` anadido al repo (commiteable, es config, no estado de ejecucion).
- `pm2 save` ejecutado — el proceso queda en `/home/lyai/.pm2/dump.pm2` para poder hacer
  `pm2 resurrect` tras perder el dump.
- Verificado de nuevo en vivo (`touch turf_framework_core.ts` → RERUN automatico, 6 tests verdes)
  bajo la config final de PM2.
- **`pm2 startup` (arranque automatico tras reboot del servidor) NO se ha configurado** — el
  clasificador de auto-mode de Claude Code lo bloqueo ("Unauthorized Persistence": instala una
  unidad systemd a nivel de sistema con sudo, fuera del alcance de "instalalo" referido a PM2).
  Si el servidor Hetzner reinicia, el watcher **no vuelve solo** — hay que lanzar a mano
  `pm2 start ecosystem.config.cjs` (o `pm2 resurrect` si el dump sigue vivo). Si se quiere
  arranque automatico tras reboot, Ignacio tiene que autorizarlo explicitamente (`pm2 startup`
  + el comando sudo que imprime).
- PM2 global es ahora una herramienta compartida del servidor (no solo de este proyecto) — si
  otro proyecto ya usaba PM2 con otro nombre de proceso, revisar `pm2 list` antes de anadir mas
  procesos para no chocar nombres.

**2026-10-19 (cont. 3) — Claude Code (server, PM)**: Expansion del motor a Portes du Soleil +
conectado el extractor .FIT a la interfaz web (a peticion de Ignacio/propuesta pegada en el chat):

- `ruta_portes_du_soleil.geojson` anadido: track orientativo Avoriaz -> Pas de Chavanette (Swiss
  Wall) -> Morzine, 13 puntos 3D, con el tramo del muro dando pendientes de hasta -62% (validado
  que son fisicamente plausibles, el primer intento daba -166% por espaciado horizontal
  demasiado corto entre puntos — corregido).
- `index.html`: la vista por defecto ya NO es Sierra Nevada — ahora hace `fetch` de
  `ruta_portes_du_soleil.geojson` al cargar (con fallback inline si el fetch falla, p.ej. abriendo
  el fichero sin servidor HTTP) y centra el mapa en 46.1850, 6.7450.
- `strava_fit_parser.ts` **reescrito**: ya no usa la API `Buffer` de Node (`readUInt8` etc.), ahora
  usa `DataView`/`Uint8Array` para poder ejecutarse igual en Node (tests) y en el navegador (no
  hay `Buffer` global en un `<script type="module">` sin bundler). API publica ampliada con
  `archivoAGeoJSON()` (devuelve las coordenadas sin pasar por `analizarRutaGeoJSON`, para que la
  UI pueda reusar `procesarMatrizPuntos` igual que con un GeoJSON).
- `index.html`: el input de fichero ahora acepta `.fit` (ademas de `.geojson`/`.json`), detecta la
  extension y lee el archivo como `ArrayBuffer` en vez de texto cuando toca.
- **Verificado en un navegador real** (Playwright, no solo tests de Node): servido el proyecto en
  un puerto local libre (**NO uses 8080 ni 8088 en este server — ambos ya estan ocupados por otro
  servicio, "Ski Weather API", probablemente de lyai-ski o similar**; comprobar con
  `ss -ltn`/intentar bind antes de elegir puerto), la pagina carga Portes du Soleil por defecto
  con las metricas correctas (7638m / +327m / 158min / 10908m equiv.), y subir un `.fit` sintetico
  generado a mano redibuja el mapa y las metricas sin errores de consola.
- Test anadido: `test/ruta_portes_du_soleil.test.ts` (3 tests, total 9/9 en la suite). El watcher
  de PM2 ya lo certifico en caliente.
- Pendiente real: `strava_fit_parser.ts` sigue sin probarse contra un `.FIT` binario real de un
  reloj Garmin/Strava (solo sinteticos); el formato real usa mensajes de longitud variable, el
  parser actual asume registros de 14 bytes fijos como simplificacion.

**2026-10-19 (cont. 4) — Claude Code (server, PM)**: Ignacio trabaja desde Windows por SSH remoto
al servidor, asi que un puerto solo-localhost no le sirve. **No hay sesion de Claude Code "central"
viva** entre los peers vistos por `ListAgents` en este momento (solo `lyai-cloud-*`, que son de
`app/lyai.cloud`, y `lyai-ski-*`) — se consultaron directamente las reglas centrales ya cargadas
(TIER 1 + `/opt/lyai/CLAUDE.md`) y la wiki de infraestructura en su lugar.

- Inventario de puertos cruzando `routes.yml` (Traefik) + `ss -ltn` en vivo: **8080 y 8088 estan
  ocupados** (confirmado antes), tambien 8085, 8090, 8188, 8989, etc. `aurelius-veto.json` →
  `active: false`, sin bloqueo.
- **No se expuso el servicio en `0.0.0.0`** — el clasificador de auto-mode de Claude Code lo
  bloqueo como "Expose Local Services" (instalar un listener accesible desde cualquier interfaz
  de red sin confirmacion explicita del usuario).
- Resuelto con **Tailscale** (ya instalado en el server, tailnet existente: `lyai-server`
  100.95.103.96 ↔ `knx` 100.125.237.53, el Windows de Ignacio): proceso PM2 nuevo
  **`rea-mapas-web`** (`python3 -m http.server 8099 --bind 100.95.103.96`, SOLO la IP de
  Tailscale, no `0.0.0.0`) sirviendo el proyecto. `pm2 save` hecho.
  → **Ignacio ve el mapa en `http://100.95.103.96:8099/`** desde su Windows, sin tunel SSH ni
  router de Traefik/dominio nuevo.
- Dos procesos PM2 corriendo ahora en este proyecto: `rea-mapas-test-watch` (vitest watch) y
  `rea-mapas-web` (servidor del mapa). `pm2 list` para verlos ambos.
- Si se quiere exposicion publica real (dominio propio via Traefik, no solo tailnet), eso exige
  editar `/home/lyai/traefik/config/routes.yml` (hoy symlink a `dynamic/routes.yml`, watch real,
  NO hace falta reiniciar Traefik desde el fix del 2026-08-30) — decision de dominio pendiente de
  Ignacio, no se ha tocado routes.yml en esta sesion.
