!macro STOP_BUNDLED_ADB
  ; Tauri places custom hooks before its app-running check. Run the same check
  ; first so a legacy app cannot restart ADB after cleanup and before extraction.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  stop_bundled_adb_retry:
    ; Pass the path through the child environment so unusual install-directory
    ; characters cannot alter the PowerShell command text.
    System::Call 'Kernel32::SetEnvironmentVariableW(w "ADB_GUI_BUNDLED_ADB", w "$INSTDIR\windows\adb.exe") i .r2'
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& { $$target = [IO.Path]::GetFullPath($$env:ADB_GUI_BUNDLED_ADB); function GetOwnedAdb { @(Get-Process -Name adb -ErrorAction SilentlyContinue | Where-Object { try { [string]::Equals([IO.Path]::GetFullPath($$_.Path), $$target, [StringComparison]::OrdinalIgnoreCase) } catch { $$false } }) }; $$owned = @(GetOwnedAdb); if ($$owned.Count -eq 0) { exit 0 }; if (-not (Test-Path -LiteralPath $$target -PathType Leaf)) { exit 1 }; & $$target kill-server 2>&1 | Out-Null; $$deadline = [DateTime]::UtcNow.AddSeconds(5); do { if (@(GetOwnedAdb).Count -eq 0) { exit 0 }; Start-Sleep -Milliseconds 50 } while ([DateTime]::UtcNow -lt $$deadline); exit 1 }"'
    Pop $0
    Pop $1
    System::Call 'Kernel32::SetEnvironmentVariableW(w "ADB_GUI_BUNDLED_ADB", p 0) i .r2'
    StrCmp $0 "0" stop_bundled_adb_done

    DetailPrint "Unable to stop the bundled ADB server before replacing its files."
    ${If} ${Silent}
    ${OrIf} $PassiveMode = 1
      Abort
    ${EndIf}

    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "ADB GUI's bundled ADB server is still using files in the install directory. Close ADB GUI and retry." IDRETRY stop_bundled_adb_retry
    Abort

  stop_bundled_adb_done:
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro STOP_BUNDLED_ADB
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro STOP_BUNDLED_ADB
!macroend
