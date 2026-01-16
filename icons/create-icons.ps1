Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$color = [System.Drawing.Color]::FromArgb(99, 102, 241)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Draw purple circle background
    $brush = New-Object System.Drawing.SolidBrush($color)
    $graphics.FillEllipse($brush, 0, 0, $size-1, $size-1)

    # Draw white "shush" symbol (simplified)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $scale = $size / 128

    # Finger (vertical bar)
    $fingerWidth = [int](12 * $scale)
    $fingerHeight = [int](45 * $scale)
    $fingerX = [int](($size - $fingerWidth) / 2)
    $fingerY = [int](28 * $scale)
    $graphics.FillRectangle($whiteBrush, $fingerX, $fingerY, $fingerWidth, $fingerHeight)

    # Mouth (horizontal ellipse)
    $mouthWidth = [int](40 * $scale)
    $mouthHeight = [int](16 * $scale)
    $mouthX = [int](($size - $mouthWidth) / 2)
    $mouthY = [int](80 * $scale)
    $graphics.FillEllipse($whiteBrush, $mouthX, $mouthY, $mouthWidth, $mouthHeight)

    $brush.Dispose()
    $whiteBrush.Dispose()
    $graphics.Dispose()

    $bmp.Save("icon$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "Created icon$size.png"
}

Write-Host "All icons created!"
