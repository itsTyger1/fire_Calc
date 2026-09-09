!ifndef BUILD_UNINSTALLER
  !include LogicLib.nsh
  !include nsDialogs.nsh

  Var desktopShortcutCheckbox
  Var desktopShortcutState

  !macro customInit
    ; Keep the default aligned with electron-builder's normal behavior.
    StrCpy $desktopShortcutState "1"
  !macroend

  !macro customPageAfterChangeDir
    Page custom createDesktopShortcutPage leaveDesktopShortcutPage
  !macroend

  Function createDesktopShortcutPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 20u "Desktop shortcut"
    Pop $0
    ${NSD_CreateLabel} 0 23u 100% 28u "Choose whether to add FIRE Projector to your desktop."
    Pop $0
    ${NSD_CreateCheckbox} 0 60u 100% 14u "Create a desktop shortcut"
    Pop $desktopShortcutCheckbox
    ${NSD_SetState} $desktopShortcutCheckbox 1
    nsDialogs::Show
  FunctionEnd

  Function leaveDesktopShortcutPage
    ${NSD_GetState} $desktopShortcutCheckbox $desktopShortcutState
  FunctionEnd

  !macro customInstall
    ; electron-builder creates the link before customInstall. Remove it when
    ; the user clears the checkbox, while leaving the Start Menu shortcut intact.
    ${If} $desktopShortcutState != "1"
      Delete "$newDesktopLink"
    ${EndIf}
  !macroend
!endif
