; Opens go2rtc's WebRTC port (UDP+TCP 18555) in Windows Firewall so live view works from the
; browser. The installer is per-user (no admin), so the rules are added through an elevated
; netsh call: Windows shows one UAC prompt. If the user declines, install still succeeds and
; Windows' own "allow go2rtc?" prompt on first live view is the fallback.

!macro customInstall
  ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall add rule name="DBI Footfall Connector WebRTC (UDP)" dir=in action=allow protocol=UDP localport=18555 profile=private,domain' SW_HIDE
  ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall add rule name="DBI Footfall Connector WebRTC (TCP)" dir=in action=allow protocol=TCP localport=18555 profile=private,domain' SW_HIDE
!macroend

!macro customUnInstall
  ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall delete rule name="DBI Footfall Connector WebRTC (UDP)"' SW_HIDE
  ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall delete rule name="DBI Footfall Connector WebRTC (TCP)"' SW_HIDE
!macroend
