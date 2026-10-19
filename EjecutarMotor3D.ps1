# =============================================================================
#  EjecutarMotor3D.ps1 — Motor de Enrutamiento 3D (REA Framework)
#  Haversine + Ecuacion Exponencial de Tobler + Carga Metabolica
# =============================================================================

# --- Coordenadas GeoJSON 3D: [Longitud, Latitud, Altitud (m)] ---------------
$coordenadasGeoJSON = @(
    @(-3.4812, 37.0543, 2100),
    @(-3.4795, 37.0560, 2105),
    @(-3.4750, 37.0610, 2350),
    @(-3.4720, 37.0635, 2330),
    @(-3.4685, 37.0660, 2500),
    @(-3.4650, 37.0700, 2480)
)

# --- Constantes y acumuladores -----------------------------------------------
$R = 6371000

$distanciaHorizontalTotal = 0.0
$distancia3DTotal         = 0.0
$tiempoTotalMinutos       = 0.0
$desnivelPositivo         = 0.0
$desnivelNegativo         = 0.0

# --- Cabecera de salida ------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   MOTOR 3D REA - Haversine + Tobler Hiking Function       " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ("   Puntos en el track: {0}" -f $coordenadasGeoJSON.Count)
Write-Host "------------------------------------------------------------"

# --- Bucle principal: recorrer cada tramo ------------------------------------
for ($i = 0; $i -lt ($coordenadasGeoJSON.Count - 1); $i++) {

    $p1 = $coordenadasGeoJSON[$i]
    $p2 = $coordenadasGeoJSON[$i + 1]

    $lon1  = $p1[0]; $lat1 = $p1[1]; $elev1 = $p1[2]
    $lon2  = $p2[0]; $lat2 = $p2[1]; $elev2 = $p2[2]

    # --- 1) FORMULA DE HAVERSINE ---
    $dLatRad = ($lat2 - $lat1) * [Math]::PI / 180
    $dLonRad = ($lon2 - $lon1) * [Math]::PI / 180

    $lat1Rad = $lat1 * [Math]::PI / 180
    $lat2Rad = $lat2 * [Math]::PI / 180

    $a = [Math]::Sin($dLatRad / 2) * [Math]::Sin($dLatRad / 2) + [Math]::Cos($lat1Rad) * [Math]::Cos($lat2Rad) * [Math]::Sin($dLonRad / 2) * [Math]::Sin($dLonRad / 2)

    $c = 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))

    $distanciaHorizontal = $R * $c

    # --- 2) DISTANCIA 3D (hipotenusa con desnivel) ---
    $desnivel = $elev2 - $elev1
    $distancia3D = [Math]::Sqrt([Math]::Pow($distanciaHorizontal, 2) + [Math]::Pow($desnivel, 2))

    # --- 3) Acumulacion de desniveles ---
    if ($desnivel -gt 0) {
        $desnivelPositivo += $desnivel
    } else {
        $desnivelNegativo += [Math]::Abs($desnivel)
    }

    # --- 4) ECUACION EXPONENCIAL DE TOBLER ---
    #     V = 6 * exp(-3.5 * |S + 0.05|)   [km/h]
    #     S = desnivel / distancia horizontal
    if ($distanciaHorizontal -gt 0) {
        $pendiente = $desnivel / $distanciaHorizontal
    } else {
        $pendiente = 0
    }

    $velocidadKmH = 6 * [Math]::Exp(-3.5 * [Math]::Abs($pendiente + 0.05))

    $tiempoTramoMin = (($distanciaHorizontal / 1000) / $velocidadKmH) * 60

    # --- 5) CARGA METABOLICA del tramo ---
    if ($desnivel -gt 0) { $desnivelPositivoTramo = $desnivel } else { $desnivelPositivoTramo = 0 }
    $cargaMetabolicaTramo = $distanciaHorizontal + ($desnivelPositivoTramo * 10)

    # Acumuladores globales
    $distanciaHorizontalTotal += $distanciaHorizontal
    $distancia3DTotal         += $distancia3D
    $tiempoTotalMinutos       += $tiempoTramoMin

    # --- Salida por tramo ---
    $numTramo = $i + 1
    $pendientePct = [Math]::Round($pendiente * 100, 1)
    Write-Host ""
    $tramoHeader = "  Tramo {0}:  [{1}, {2}, {3}] -> [{4}, {5}, {6}]" -f $numTramo, $lon1, $lat1, $elev1, $lon2, $lat2, $elev2
    Write-Host $tramoHeader -ForegroundColor White
    Write-Host ("    Dist. horizontal : {0:N1} m" -f $distanciaHorizontal)
    Write-Host ("    Dist. 3D real    : {0:N1} m" -f $distancia3D)
    Write-Host ("    Desnivel         : {0:N1} m  ({1}%)" -f $desnivel, $pendientePct)
    Write-Host ("    Velocidad Tobler : {0:N2} km/h" -f $velocidadKmH)
    Write-Host ("    Tiempo tramo     : {0:N1} min" -f $tiempoTramoMin)
    Write-Host ("    Carga metabolica : {0:N1} m equiv." -f $cargaMetabolicaTramo) -ForegroundColor DarkYellow
}

# --- Metricas globales -------------------------------------------------------
$cargaMetabolicaTotal = $distanciaHorizontalTotal + ($desnivelPositivo * 10)
$tiempoHoras          = [Math]::Floor($tiempoTotalMinutos / 60)
$tiempoMinResto       = [Math]::Round($tiempoTotalMinutos % 60)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "   RESULTADOS GLOBALES DEL MOTOR 3D                        " -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ("   Distancia horizontal total  : {0:N1} m ({1:N2} km)" -f $distanciaHorizontalTotal, ($distanciaHorizontalTotal / 1000))
Write-Host ("   Distancia 3D real total     : {0:N1} m ({1:N2} km)" -f $distancia3DTotal, ($distancia3DTotal / 1000))
Write-Host ("   Desnivel acumulado          : +{0:N0} m / -{1:N0} m" -f $desnivelPositivo, $desnivelNegativo)
Write-Host ("   Carga metabolica equivalente: {0:N1} m en plano ({1:N2} km)" -f $cargaMetabolicaTotal, ($cargaMetabolicaTotal / 1000)) -ForegroundColor DarkYellow
Write-Host ""
Write-Host ("   TIEMPO ESTIMADO DE MARCHA   : {0}h {1}min  ({2:N1} min totales)" -f $tiempoHoras, $tiempoMinResto, $tiempoTotalMinutos) -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
