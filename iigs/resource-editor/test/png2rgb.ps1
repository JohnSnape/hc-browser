# png2rgb.ps1 <in.png> <out.rgb> -- GSport capture -> 640x200 RGB (3 bytes a pixel).
# GSport draws the Super Hi-Res screen 1:1 across with every line doubled, inside a border;
# the screen's top-left is the first pixel that is not border color.
param([string]$In, [string]$Out)
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile($In)
$border = $b.GetPixel(2, 2).ToArgb()
$x0 = 0; while ($b.GetPixel($x0, 200).ToArgb() -eq $border) { $x0++ }
$y0 = 0; while ($b.GetPixel(300, $y0).ToArgb() -eq $border) { $y0++ }
$rect = New-Object System.Drawing.Rectangle 0, 0, $b.Width, $b.Height
$data = $b.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = $data.Stride
$raw = New-Object byte[] ($stride * $b.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
$b.UnlockBits($data)
$buf = New-Object byte[] (640 * 200 * 3)
for ($y = 0; $y -lt 200; $y++) {
  $row = ($y0 + 2 * $y) * $stride
  for ($x = 0; $x -lt 640; $x++) {
    $s = $row + ($x0 + $x) * 3; $i = ($y * 640 + $x) * 3
    $buf[$i] = $raw[$s + 2]; $buf[$i + 1] = $raw[$s + 1]; $buf[$i + 2] = $raw[$s]
  }
}
[System.IO.File]::WriteAllBytes($Out, $buf)
"origin $x0,$y0 -> $Out"
