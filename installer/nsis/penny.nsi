; Penny installer (publisher: Akrot) - built with NSIS, per-user, no admin rights.
; The app files are small; the open-source Electron runtime is downloaded once, checked against a pinned SHA-256, and reused on updates.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
ManifestDPIAware true

!define APP_NAME "Penny"
!define PUBLISHER "__PUBLISHER__"
!define APP_VERSION "__VERSION__"
!define APP_VERSION4 "__VERSION__.0"
!define ELECTRON_VER "44.8.0"
!define ELECTRON_ZIP "electron-v${ELECTRON_VER}-win32-x64.zip"
!define ELECTRON_URL "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/${ELECTRON_ZIP}"
!define ELECTRON_SHA "__SHA__"
; keep these two unchanged: an existing install (same key and folder) is upgraded in place
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Penny"
!define EXE "Penny.exe"

!addplugindir /x86-unicode "__PLUGINS__"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name "${APP_NAME}"
OutFile "__OUT__"
InstallDir "$LOCALAPPDATA\Programs\Penny"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
BrandingText "${APP_NAME} ${APP_VERSION} · ${PUBLISHER}"
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "${APP_VERSION4}"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (c) __YEAR__ ${PUBLISHER}"

!define MUI_ICON "__ICON__"
!define MUI_UNICON "__ICON__"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Every cent, in focus.$\r$\n$\r$\nThis wizard installs ${APP_NAME} ${APP_VERSION} by ${PUBLISHER} for your Windows account. Everything you enter stays on this PC.$\r$\n$\r$\nThe first install downloads the open-source app runtime once (about 150 MB). Updating an existing install does not need to download it again."
!define MUI_LICENSEPAGE_TEXT_TOP "Please read the license agreement. The privacy notice is installed next to the app."
!define MUI_FINISHPAGE_TITLE "${APP_NAME} is ready"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APP_NAME} now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "__LICENSE__"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var ZipPath
Var Downloaded

Section "Install" SecInstall
  SetDetailsPrint both
  DetailPrint "Closing ${APP_NAME} if it is running..."
  nsExec::Exec 'taskkill /F /IM ${EXE}'
  Pop $0
  Sleep 400

  ; ---- 1. app files (small) ----
  DetailPrint "Installing application files..."
  CreateDirectory "$INSTDIR"
  RMDir /r "$INSTDIR\resources\app"
  SetOutPath "$INSTDIR\resources\app"
  File /r "__APPDIR__\*.*"
  SetOutPath "$INSTDIR"
  File "__ICON__"
  File "__LICENSE__"
  File "__PRIVACY__"

  ; ---- 2. runtime: already installed for this version? then skip the download ----
  ${If} ${FileExists} "$INSTDIR\${EXE}"
  ${AndIf} ${FileExists} "$INSTDIR\runtime-${ELECTRON_VER}.txt"
    DetailPrint "App runtime is already up to date - skipping download."
    Goto shortcuts
  ${EndIf}

  StrCpy $Downloaded "0"
  StrCpy $ZipPath "$EXEDIR\${ELECTRON_ZIP}"
  ${IfNot} ${FileExists} "$ZipPath"
    StrCpy $ZipPath "$PLUGINSDIR\${ELECTRON_ZIP}"
    DetailPrint "Downloading the app runtime (one time, ~150 MB)..."
    retry_download:
    inetc::get /CAPTION "Downloading ${APP_NAME}" /BANNER "Downloading the app runtime (about 150 MB).$\nThis only happens once." /RESUME "The connection was interrupted. Retry?" "${ELECTRON_URL}" "$ZipPath" /END
    Pop $0
    ${If} $0 != "OK"
      DetailPrint "Download failed: $0"
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Could not download the app runtime ($0).$\r$\n$\r$\nCheck your internet connection and retry, or download ${ELECTRON_ZIP}$\r$\nfrom github.com/electron/electron/releases/tag/v${ELECTRON_VER} and place it next to this installer." IDRETRY retry_download
      Abort "Download cancelled."
    ${EndIf}
    StrCpy $Downloaded "1"
  ${Else}
    DetailPrint "Using runtime found next to the installer."
  ${EndIf}

  ; ---- 3. verify integrity (pinned SHA-256) ----
  DetailPrint "Verifying download..."
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-FileHash -Algorithm SHA256 -LiteralPath $\'$ZipPath$\').Hash -ieq $\'${ELECTRON_SHA}$\') { exit 0 } else { exit 1 }"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    ${If} $Downloaded == "1"
      Delete "$ZipPath"
    ${EndIf}
    Abort "The app runtime failed its integrity check. Please run setup again."
  ${EndIf}

  ; ---- 4. extract runtime ----
  DetailPrint "Installing the app runtime..."
  nsisunz::UnzipToLog "$ZipPath" "$INSTDIR"
  Pop $0
  ${If} $0 != "success"
    Abort "Could not unpack the runtime: $0"
  ${EndIf}
  ${If} $Downloaded == "1"
    Delete "$ZipPath"
  ${EndIf}
  Delete "$INSTDIR\${EXE}"
  Rename "$INSTDIR\electron.exe" "$INSTDIR\${EXE}"
  Delete "$INSTDIR\resources\default_app.asar"
  FileOpen $4 "$INSTDIR\runtime-${ELECTRON_VER}.txt" w
  FileWrite $4 "electron ${ELECTRON_VER}"
  FileClose $4

  ; keep only the English locale pack
  FindFirst $2 $3 "$INSTDIR\locales\*.pak"
  loc_loop:
    StrCmp $3 "" loc_done
    StrCmp $3 "en-US.pak" loc_next
    Delete "$INSTDIR\locales\$3"
    loc_next:
    FindNext $2 $3
    Goto loc_loop
  loc_done:
  FindClose $2

  ; ---- 5. shortcuts + uninstaller + Add/Remove Programs ----
  shortcuts:
  ; brand the runtime: Penny's icon and name on Penny.exe, so Task Manager, Explorer and the taskbar say Penny, not Electron.
  ; rcedit (MIT, github.com/electron/rcedit) runs from the temp folder and is not installed. Runs on every install/upgrade.
  DetailPrint "Applying the Penny icon..."
  InitPluginsDir
  File "/oname=$PLUGINSDIR\rcedit.exe" "__RCEDIT__"
  nsExec::ExecToLog '"$PLUGINSDIR\rcedit.exe" "$INSTDIR\${EXE}" --set-icon "$INSTDIR\icon.ico" --set-version-string "FileDescription" "${APP_NAME}" --set-version-string "ProductName" "${APP_NAME}" --set-version-string "CompanyName" "${PUBLISHER}" --set-version-string "InternalName" "${APP_NAME}" --set-version-string "OriginalFilename" "${EXE}" --set-version-string "LegalCopyright" "${PUBLISHER}" --set-file-version "${APP_VERSION4}" --set-product-version "${APP_VERSION4}"'
  Pop $0
  ${If} $0 != "0"
    DetailPrint "Could not stamp the icon onto ${EXE} ($0). Shortcuts still show the Penny icon."
  ${EndIf}
  ; a fresh name for the shortcut icon, so Windows cannot show a cached old one after an upgrade
  Delete "$INSTDIR\penny-*.ico"
  CopyFiles /SILENT "$INSTDIR\icon.ico" "$INSTDIR\penny-v${APP_VERSION}.ico"
  DetailPrint "Creating shortcuts..."
  SetShellVarContext current
  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\penny-v${APP_VERSION}.ico" 0
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\penny-v${APP_VERSION}.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\penny-v${APP_VERSION}.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  __SUPPORT_REG__
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" $0
  ; refresh Explorer's icon cache (Windows 10/11) and let Penny re-point pinned shortcuts on its next start
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  Pop $0
  Delete "$APPDATA\Penny\icon-sync.json"
  DetailPrint "Done."
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM ${EXE}'
  Pop $0
  Sleep 400
  SetShellVarContext current
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKCU "${UNINST_KEY}"
  IfFileExists "$APPDATA\Penny\*.*" 0 skip_data
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your financial data and backups?$\r$\n$\r$\n$APPDATA\Penny$\r$\n$\r$\nChoose No to keep them in case you reinstall." IDNO skip_data
    RMDir /r "$APPDATA\Penny"
  skip_data:
  ; remove only what Setup installed (never the whole folder blindly)
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\penny-*.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
