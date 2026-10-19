function Obtener-DossierVisualRuta {
    # Entrada de datos GeoJSON 3D de alta montana (Sierra Nevada)
    # Formato Mapbox: [Longitud, Latitud, Altitud en metros]
    $puntosRuta = @(
        @(-3.4812, 37.0543, 2100),
        @(-3.4795, 37.0560, 2105),
        @(-3.4750, 37.0610, 2350),
        @(-3.4720, 37.0635, 2330),
        @(-3.4685, 37.0660, 2500)
    )

    $R = 6371000
    $distanciaPlanaTotal = 0
    $tiempoTotalMinutos = 0
    $desnivelPositivo = 0

    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host "   REA MOUNTAIN LOGIC - MOTOR GEOMETRICO AUTONOMO 3D    " -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    for ($i = 0; $i -lt ($puntosRuta.Count - 1); $i++) {
        $p1 = $puntosRuta[$i]
        $p2 = $puntosRuta[$i + 1]

        $lon1 = $p1[0]; $lat1 = $p1[1]; $elev1 = $p1[2]
        $lon2 = $p2[0]; $lat2 = $p2[1]; $elev2 = $p2[2]

        # Haversine: distancia horizontal entre dos puntos GPS
        $dLat = ($lat2 - $lat1) * [Math]::PI / 180
        $dLon = ($lon2 - $lon1) * [Math]::PI / 180
        $lat1Rad = $lat1 * [Math]::PI / 180
        $lat2Rad = $lat2 * [Math]::PI / 180

        $a = [Math]::Sin($dLat / 2) * [Math]::Sin($dLat / 2) +
             [Math]::Cos($lat1Rad) * [Math]::Cos($lat2Rad) *
             [Math]::Sin($dLon / 2) * [Math]::Sin($dLon / 2)
        $c = 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))
        $distH = $R * $c

        $dZ = $elev2 - $elev1
        if ($dZ -gt 0) { $desnivelPositivo += $dZ }

        # Pendiente en porcentaje
        if ($distH -gt 0) {
            $pendientePct = ($dZ / $distH) * 100
            $pendienteSeno = $dZ / $distH
        } else {
            $pendientePct = 0
            $pendienteSeno = 0
        }

        # Velocidad de Tobler (km/h)
        $velTobler = 6 * [Math]::Exp(-3.5 * [Math]::Abs($pendienteSeno + 0.05))

        # Tiempo del tramo en minutos
        if ($velTobler -gt 0) {
            $tiempoTramo = (($distH / 1000) / $velTobler) * 60
        } else {
            $tiempoTramo = 0
        }

        $distanciaPlanaTotal += $distH
        $tiempoTotalMinutos += $tiempoTramo

        # Clasificacion de color segun pendiente
        $absPct = [Math]::Abs($pendientePct)

        if ($dZ -lt -5) {
            $colorRender = "Azul (Descenso Tecnico)"
            $fgColor = "Blue"
        } elseif ($absPct -gt 35) {
            $colorRender = "Roja (Muro Tecnico Peligroso)"
            $fgColor = "Red"
        } elseif ($absPct -gt 15) {
            $colorRender = "Naranja (Pendiente Moderada)"
            $fgColor = "DarkYellow"
        } else {
            $colorRender = "Verde (Terreno Seguro)"
            $fgColor = "Green"
        }

        $numTramo = $i + 1
        $distRound = [Math]::Round($distH, 1)
        $pctRound = [Math]::Round($pendientePct, 1)
        $velRound = [Math]::Round($velTobler, 2)
        $tRound = [Math]::Round($tiempoTramo, 1)

        Write-Host "`nTramo $numTramo`:" -ForegroundColor Cyan
        Write-Host "  -> Distancia Plana: $distRound metros | Desnivel: ${dZ}m"
        Write-Host "  -> Inclinacion Calculada: ${pctRound}%"
        Write-Host "  -> Velocidad Humana: $velRound km/h | Tiempo: $tRound min"
        Write-Host "  -> [RENDER WEB] Pintar linea en mapa: $colorRender" -ForegroundColor $fgColor
    }

    # Metricas globales
    $cargaMetabolica = $distanciaPlanaTotal + ($desnivelPositivo * 10)

    Write-Host "`n--------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "RESUMEN DE METRICAS FORMALES PARA LA HERRAMIENTA AUTONOMA:" -ForegroundColor Yellow
    Write-Host "-> Longitud Lineal Horizontal: $([Math]::Round($distanciaPlanaTotal, 1)) metros"
    Write-Host "-> Esfuerzo en Plano Equivalente (Carga): $([Math]::Round($cargaMetabolica, 1)) metros"
    Write-Host "-> TIEMPO ESTIMADO DE MARCHA: $([Math]::Round($tiempoTotalMinutos, 1)) minutos" -ForegroundColor Green
    Write-Host "========================================================`n" -ForegroundColor Cyan
}

Obtener-DossierVisualRuta
