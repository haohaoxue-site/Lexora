!define BUDDY_INSTALLER_SOURCE_DIR "${__FILEDIR__}"
!define /redef APP_FILENAME "${PRODUCT_FILENAME}"

!macro customHeader
  !ifdef BUILD_UNINSTALLER
    Function un.BuddyCheckAppRunning
  !else
    Function BuddyCheckAppRunning
  !endif
    Push $0
    Push $1
    InitPluginsDir
    ClearErrors
    File /oname=$PLUGINSDIR\buddy-check-running.ps1 "${BUDDY_INSTALLER_SOURCE_DIR}\check-running.ps1"
    IfErrors buddy_probe_failed

    buddy_retry:
      DetailPrint "正在检查应用状态 / Checking application state..."
      nsExec::ExecToStack /TIMEOUT=15000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\buddy-check-running.ps1" -ExecutablePath "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
      Pop $0
      Pop $1
      StrCmp $0 "0" buddy_ready
      StrCmp $0 "32" buddy_running

    buddy_probe_failed:
      SetErrorLevel 1603
      StrCpy $1 "无法确认此安装中的 Buddy 是否已退出，操作已停止。请检查系统状态后重试，或取消。$\r$\n$\r$\nUnable to check whether this installation is running. Retry after checking your system, or cancel."
      Goto buddy_blocked

    buddy_running:
      SetErrorLevel 32
      StrCpy $1 "此安装中的 Buddy 仍在运行。请从系统托盘选择退出，等待退出完成后重试，或取消。安装器不会终止应用。$\r$\n$\r$\nBuddy is still running from this installation. Quit from the system tray, then retry, or cancel. The installer will not terminate the app."

    buddy_blocked:
      IfSilent 0 +2
      Quit
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$1" IDRETRY buddy_retry
      SetErrorLevel 1602
      Quit

    buddy_ready:
      SetErrorLevel 0
      Pop $1
      Pop $0
    FunctionEnd
!macroend

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    Call un.BuddyCheckAppRunning
  !else
    Call BuddyCheckAppRunning
  !endif
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
