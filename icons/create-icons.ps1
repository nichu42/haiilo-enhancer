Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)

# Brand Colors
$tealColor = [System.Drawing.Color]::FromArgb(15, 147, 157)   # #0f939d
$purpleColor = [System.Drawing.Color]::FromArgb(80, 35, 121)  # #502379

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    # 1. Draw the Rounded Teal Box
    $tealBrush = New-Object System.Drawing.SolidBrush($tealColor)
    $cornerRadius = $size * 0.2
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rect.X, $rect.Y, $cornerRadius, $cornerRadius, 180, 90)
    $path.AddArc($rect.Right - $cornerRadius, $rect.Y, $cornerRadius, $cornerRadius, 270, 90)
    $path.AddArc($rect.Right - $cornerRadius, $rect.Bottom - $cornerRadius, $cornerRadius, $cornerRadius, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $cornerRadius, $cornerRadius, $cornerRadius, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($tealBrush, $path)

    # 2. Draw the Purple "E" (Larger Scale)
    $purpleBrush = New-Object System.Drawing.SolidBrush($purpleColor)
    
    # Scale increased to 0.8 (80% of icon size)
    $scale = $size * 0.8 / 100
    
    # Mathematical centering based on the 70x80 shape unit
    $moveX = ($size - (70 * $scale)) / 2
    $moveY = ($size - (80 * $scale)) / 2

    $ePoints = @(
        (New-Object System.Drawing.PointF( (0 * $scale + $moveX), (0 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (70 * $scale + $moveX), (0 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (70 * $scale + $moveX), (15 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (20 * $scale + $moveX), (15 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (20 * $scale + $moveX), (32 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (60 * $scale + $moveX), (32 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (60 * $scale + $moveX), (48 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (20 * $scale + $moveX), (48 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (20 * $scale + $moveX), (65 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (70 * $scale + $moveX), (65 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (70 * $scale + $moveX), (80 * $scale + $moveY) )),
        (New-Object System.Drawing.PointF( (0 * $scale + $moveX), (80 * $scale + $moveY) ))
    )
    $graphics.FillPolygon($purpleBrush, $ePoints)

    # Save
    $bmp.Save("icon$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    
    $tealBrush.Dispose(); $purpleBrush.Dispose(); $path.Dispose(); $graphics.Dispose(); $bmp.Dispose()
    Write-Host "Created larger icon$size.png"
}