# Persistent JSON-lines helper: real Win32 pointer/keyboard/focus on the primary display. Never logs typed text for secret commands.
# stdin: {"id":1,"cmd":"move","x":100,"y":200,"seed":..}   stdout: {"id":1,"ok":true,...}
param([int]$Seed = 4242)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Runtime.InteropServices;
public class N{
[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")]public static extern bool GetCursorPos(out P p);
[DllImport("user32.dll")]public static extern void mouse_event(uint f,int dx,int dy,uint d,UIntPtr e);
[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);
[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
[DllImport("user32.dll")]public static extern bool BringWindowToTop(IntPtr h);
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll", CharSet=CharSet.Unicode)]public static extern IntPtr FindWindow(string cls, string title);
public delegate bool EnumProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc p, IntPtr l);
[DllImport("user32.dll", CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
public static IntPtr FindTitle(string title) { IntPtr found = IntPtr.Zero; EnumWindows((h, l) => { if (IsWindowVisible(h)) { var sb = new System.Text.StringBuilder(200); GetWindowText(h, sb, 200); if (sb.ToString() == title) { found = h; return false; } } return true; }, IntPtr.Zero); return found; }
[DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
[DllImport("user32.dll")]public static extern int GetWindowTextLength(IntPtr h);
public struct P{public int X,Y;}}
"@
[N]::SetProcessDPIAware() | Out-Null
$rng = New-Object Random $Seed
function Pos { $p = New-Object N+P; [N]::GetCursorPos([ref]$p) | Out-Null; $p }
function Rand($lo, $hi) { $rng.Next([int]$lo, [int]$hi + 1) }

# Piecewise, uneven pointer movement: coarse approach, braking, a real stop, optional small safe correction.
function MoveTo($x, $y, $overshoot) {
  $start = Pos; $dist = [math]::Sqrt([math]::Pow($x - $start.X, 2) + [math]::Pow($y - $start.Y, 2))
  if ($dist -lt 3) { return }
  $total = [math]::Min(560, [math]::Max(220, 160 + $dist * 0.25)) * (0.85 + 0.3 * $rng.NextDouble())
  $segs = if ($dist -lt 60) { 1 } else { Rand 2 3 }
  $tx = $x; $ty = $y
  if ($overshoot -and $dist -gt 150) { $dx = Rand 2 7; $dy = Rand -4 4; $tx = $x + $dx; $ty = $y + $dy }
  $fromX = $start.X; $fromY = $start.Y
  for ($i = 1; $i -le $segs; $i++) {
    $frac = if ($i -eq $segs) { 1.0 } else { ($i / $segs) * (0.72 + 0.26 * $rng.NextDouble()) }
    $sx = [int]($start.X + ($tx - $start.X) * $frac); $sy = [int]($start.Y + ($ty - $start.Y) * $frac)
    $steps = Rand 5 9; $segMs = $total / $segs * (0.7 + 0.6 * $rng.NextDouble())
    for ($s = 1; $s -le $steps; $s++) {
      $t = $s / $steps; $e = 1 - [math]::Pow(1 - $t, 1.4 + 1.6 * $rng.NextDouble())  # braking toward each stop
      [N]::SetCursorPos([int]($fromX + ($sx - $fromX) * $e), [int]($fromY + ($sy - $fromY) * $e)) | Out-Null
      Start-Sleep -Milliseconds ([int]($segMs / $steps))
    }
    $fromX = $sx; $fromY = $sy
    Start-Sleep -Milliseconds (Rand 50 130)
  }
  if ($tx -ne $x -or $ty -ne $y) { Start-Sleep -Milliseconds (Rand 70 150); [N]::SetCursorPos($x, $y) | Out-Null }
}
function Click([string]$button) {
  $down, $up = if ($button -eq 'right') { 8, 16 } else { 2, 4 }
  Start-Sleep -Milliseconds (Rand 40 110); [N]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds (Rand 55 120); [N]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
}
function SendChar([string]$c) {
  $k = if ('+^%~(){}[]'.Contains($c)) { '{' + $c + '}' } else { $c }
  [System.Windows.Forms.SendKeys]::SendWait($k)
}
function TypeText([string]$text, $lo, $hi) {
  foreach ($c in $text.ToCharArray()) {
    SendChar ([string]$c)
    $d = Rand $lo $hi; if ($c -eq ' ') { $d += Rand 120 350 }
    Start-Sleep -Milliseconds $d
  }
}
$out = [Console]::Out
$out.WriteLine('{"ready":true}'); $out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine(); if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $r = @{ id = $null; ok = $true }
  try {
    $m = $line | ConvertFrom-Json; $r.id = $m.id
    switch ($m.cmd) {
      'move' { MoveTo ([int]$m.x) ([int]$m.y) ([bool]$m.overshoot) }
      'click' { Click ([string]$m.button) }
      'type' { $lo = 140; $hi = 320; if ($m.lo) { $lo = [int]$m.lo }; if ($m.hi) { $hi = [int]$m.hi }; TypeText ([string]$m.text) $lo $hi }
      'backspace' { for ($i = 0; $i -lt [int]$m.count; $i++) { [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}'); Start-Sleep -Milliseconds (Rand 100 220) } }
      'keys' { [System.Windows.Forms.SendKeys]::SendWait([string]$m.seq) }
      'sleep' { Start-Sleep -Milliseconds ([int]$m.ms) }
      'scroll' { [N]::mouse_event(0x0800, 0, 0, [uint32](([int64]$m.delta) -band 0xFFFFFFFFL), [UIntPtr]::Zero) }
      'foreground' { $h = [IntPtr][int64]$m.hwnd; if ($m.minimize) { [N]::ShowWindow([IntPtr][int64]$m.minimize, 6) | Out-Null }; [N]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [N]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); if ([N]::IsIconic($h)) { [N]::ShowWindow($h, 9) | Out-Null }; [N]::BringWindowToTop($h) | Out-Null; $r.fg = [N]::SetForegroundWindow($h); Start-Sleep -Milliseconds 150; $r.now = ([N]::GetForegroundWindow() -eq $h) }
      'place' { $h = [IntPtr][int64]$m.hwnd; [N]::ShowWindow($h, 9) | Out-Null; [N]::MoveWindow($h, 0, 0, 1920, 1080, $true) | Out-Null }
      'waitdialog' { $deadline = [DateTime]::Now.AddMilliseconds([int]$m.timeoutMs); $h = [IntPtr]::Zero; while ([DateTime]::Now -lt $deadline) { $h = [N]::FindTitle([string]$m.title); if ($h -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 100 }; $r.found = ($h -ne [IntPtr]::Zero); $r.hwnd = [int64]$h }
      'dialogclosed' { $deadline = [DateTime]::Now.AddMilliseconds([int]$m.timeoutMs); while ([DateTime]::Now -lt $deadline) { if ([N]::FindTitle([string]$m.title) -eq [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 100 }; $r.closed = ([N]::FindTitle([string]$m.title) -eq [IntPtr]::Zero) }
      'taskbar' { $tb = [N]::FindWindow('Shell_TrayWnd', $null); if ($tb -ne [IntPtr]::Zero) { [N]::ShowWindow($tb, $(if ([bool]$m.visible) { 5 } else { 0 })) | Out-Null; $r.found = $true } else { $r.found = $false } }
      'cursor' { $p = Pos; $r.x = $p.X; $r.y = $p.Y }
      'ping' { }
      default { throw "unknown cmd $($m.cmd)" }
    }
  } catch { $r.ok = $false; $r.error = $_.Exception.Message }
  $out.WriteLine(($r | ConvertTo-Json -Compress)); $out.Flush()
}
