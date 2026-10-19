function Obtener-AnalisisRutaCompleto {
    # Coordenadas GeoJSON tridimensionales reales: [Longitud, Latitud, Altitud en metros]
    \$coordenadasGeoJSON = @(
        @(-3.4812, 37.0543, 2100), 
        @(-3.4795, 37.0560, 2105), 
        @(-3.4750, 37.0610, 2350), 
        @(-3.4720, 37.0635, 2330)  
    )

    \$distanciaPlanaTotal = 0
    \(tiempoTotalMinutos = 0\)desnivelPositivoAcumulado = 0
    \(desnivelNegativoAcumulado = 0\)R = 6371000 

    Write-Host "`n====================================================" -ForegroundColor Cyan
    Write-Host "   PROCESANDO TRACK GEOMETRICO TRIDIMENSIONAL REA   " -ForegroundColor Cyan
    Write-Host "====================================================`n" -ForegroundColor Cyan

    for (i = 0; i -lt (coordenadasGeoJSON.Count - 1); i++) {
        p1 = coordenadasGeoJSON[\(i]\)p2 = \(coordenadasGeoJSON[\)i+1]

        lon1 = p1[0]; lat1 = p1[1]; elev1 = p1[2]
        lon2 = p2[0]; lat2 = p2[1]; elev2 = p2[2]

        # Geometría Haversine (Distancia entre puntos sobre la esfera terrestre)
        dLat = (lat2 - \(lat1) * [Math]::PI / 180\)dLon = (lon2 - lon1) * [Math]::PI / 180
        
        lat1Rad = lat1 * [Math]::PI / 180
        lat2Rad = lat2 * [Math]::PI / 180

        \$a = [Math]::Sin(\(dLat/2) * [Math]::Sin(\)dLat/2) +
             [Math]::Cos(\(lat1Rad) * [Math]::Cos(\)lat2Rad) * 
             [Math]::Sin(\(dLon/2) * [Math]::Sin(\)dLon/2)
        
        \(c = 2 * [Math]::Atan2([Math]::Sqrt(\)a), [Math]::Sqrt(1-\(a))\)distanciaTramo = R * c

        # Análisis del relieve Z
        \$desnivelTramo = elev2 - elev1
        if (\$desnivelTramo -gt 0) { desnivelPositivoAcumulado += desnivelTramo }
        else { \(desnivelNegativoAcumulado += [Math]::Abs(\)desnivelTramo) }

        # Ecuación Exponencial de Tobler
        pendienteSeno = desnivelTramo / \(distanciaTramo\)velocidadKmH = 6 * [Math]::Exp(-3.5 * [Math]::Abs(\(pendienteSeno + 0.05))\)tiempoTramoMinutos = ((distanciaTramo / 1000) / velocidadKmH) * 60

        distanciaPlanaTotal += distanciaTramo
        tiempoTotalMinutos += tiempoTramoMinutos

        Write-Host "Tramo (i+1): Distancia Horizontal = \(([Math]::Round(\)distanciaTramo,1))m | Desnivel = (desnivelTramo)m | Ritmo = \(([Math]::Round(\)velocidadKmH,2)) km/h" -ForegroundColor Gray
    }

    # Penalización de esfuerzo
    \$distanciaEsfuerzoEquivalente = distanciaPlanaTotal + (desnivelPositivoAcumulado * 10)

    Write-Host "`n----------------------------------------------------" -ForegroundColor Yellow
    Write-Host "RESULTADOS GLOBALES DEL ENRUTADOR REAL:" -ForegroundColor Yellow
    Write-Host "-> Distancia Horizontal Pura: $([Math]::Round($distanciaPlanaTotal,1)) metros"
    Write-Host "-> Desnivel Acumulado: +$($desnivelPositivoAcumulado)m / -$($desnivelNegativoAcumulado)m"
    Write-Host "-> Carga Metabólica Equivalente: $([Math]::Round($distanciaEsfuerzoEquivalente,1)) metros en plano"
    Write-Host "-> TIEMPO REAL ESTIMADO DE MARCHA: $([Math]::Round($tiempoTotalMinutos,1)) minutos" -ForegroundColor Green
    Write-Host "====================================================`n" -ForegroundColor Cyan
}
