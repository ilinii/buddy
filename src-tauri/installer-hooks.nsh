; Buddy deliberately does not force-close the app during install/uninstall.
; Uses the Restart Manager macros supplied by Tauri's MIT/Apache-2.0 template.
; Override its default helper (which otherwise kills processes in silent mode).
!ifmacrodef CheckIfAppIsRunning
  !macroundef CheckIfAppIsRunning
!endif
!macro CheckIfAppIsRunning executablePath productName
  ${If} ${FileExists} "${executablePath}"
    !insertmacro RestartManager_StartSession $R0
    ${If} $R0 == ""
      SetErrorLevel 1618
      Abort "Could not verify that Buddy is closed. Close it before retrying."
    ${EndIf}
    !insertmacro RestartManager_RegisterFile $R0 "${executablePath}"
    ${If} $0 != 0
      !insertmacro RestartManager_EndSession $R0
      SetErrorLevel 1618
      Abort "Could not verify that Buddy is closed. Close it before retrying."
    ${EndIf}
    System::Call 'RSTRTMGR::RmGetList(p R0, *i .r1, *i .r2, p 0, *i .r3) i .r0'
    StrCpy $R4 $0
    !insertmacro RestartManager_EndSession $R0
    ${If} $R4 != 0
      SetErrorLevel 1618
      IfSilent +2 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Finish any recording and close Buddy before installing or uninstalling."
      Abort
    ${EndIf}
  ${EndIf}
!macroend
