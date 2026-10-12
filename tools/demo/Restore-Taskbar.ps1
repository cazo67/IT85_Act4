# Emergency/normal restore of the primary Windows taskbar hidden during a demo run.
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class TB{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr FindWindow(string c,string t);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}'
$h = [TB]::FindWindow('Shell_TrayWnd', $null); if ($h -ne [IntPtr]::Zero) { [TB]::ShowWindow($h, 5) | Out-Null; 'taskbar restored' } else { 'taskbar window not found' }
