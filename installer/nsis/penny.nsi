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
!define MUI_WELCOMEPAGE_TITLE "$(L_WTITLE)"
!define MUI_WELCOMEPAGE_TEXT "$(L_WTEXT)"
!define MUI_LICENSEPAGE_TEXT_TOP "$(L_LICTOP)"
!define MUI_FINISHPAGE_TITLE "$(L_FTITLE)"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "$(L_FRUN)"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "__LICENSE__"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
; Setup speaks the Windows display language when it is one of these (English otherwise). The license text stays English (binding).
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "Hindi"
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "Arabic"

LangString L_WTITLE ${LANG_ENGLISH} "Welcome to ${APP_NAME}"
LangString L_WTITLE ${LANG_SIMPCHINESE} "欢迎使用 ${APP_NAME}"
LangString L_WTITLE ${LANG_HINDI} "${APP_NAME} में आपका स्वागत है"
LangString L_WTITLE ${LANG_SPANISH} "Te damos la bienvenida a ${APP_NAME}"
LangString L_WTITLE ${LANG_ARABIC} "مرحبًا بك في ${APP_NAME}"
LangString L_WTEXT ${LANG_ENGLISH} "Every cent, in focus.$\r$\n$\r$\nThis wizard installs ${APP_NAME} ${APP_VERSION} by ${PUBLISHER} for your Windows account. Everything you enter stays on this PC.$\r$\n$\r$\nThe first install downloads the open-source app runtime once (about 150 MB). Updating an existing install does not need to download it again."
LangString L_WTEXT ${LANG_SIMPCHINESE} "每一分钱，都清清楚楚。$\r$\n$\r$\n此向导将为你的 Windows 帐户安装 ${PUBLISHER} 出品的 ${APP_NAME} ${APP_VERSION}。你输入的所有内容都只保存在这台电脑上。$\r$\n$\r$\n首次安装会下载一次开源的应用运行环境（约 150 MB）。更新已安装的版本时无需再次下载。"
LangString L_WTEXT ${LANG_HINDI} "हर पैसे पर साफ़ नज़र।$\r$\n$\r$\nयह विज़ार्ड आपके Windows खाते के लिए ${PUBLISHER} का ${APP_NAME} ${APP_VERSION} इंस्टॉल करता है। आप जो कुछ भी दर्ज करते हैं, वह इसी PC पर रहता है।$\r$\n$\r$\nपहली बार इंस्टॉल करने पर ओपन-सोर्स ऐप रनटाइम एक बार डाउनलोड होता है (लगभग 150 MB)। पहले से इंस्टॉल ऐप को अपडेट करने पर इसे दोबारा डाउनलोड नहीं करना पड़ता।"
LangString L_WTEXT ${LANG_SPANISH} "Cada céntimo, bajo control.$\r$\n$\r$\nEste asistente instala ${APP_NAME} ${APP_VERSION} de ${PUBLISHER} en tu cuenta de Windows. Todo lo que introduces se queda en este PC.$\r$\n$\r$\nLa primera instalación descarga una sola vez el entorno de ejecución de código abierto (unos 150 MB). Para actualizar una instalación existente no hace falta volver a descargarlo."
LangString L_WTEXT ${LANG_ARABIC} "كل قرش تحت نظرك.$\r$\n$\r$\nيثبّت هذا المعالج ${APP_NAME} ${APP_VERSION} من ${PUBLISHER} على حساب Windows الخاص بك. كل ما تُدخله يبقى على هذا الكمبيوتر.$\r$\n$\r$\nيُنزِّل التثبيت الأول بيئة تشغيل التطبيق مفتوحة المصدر مرة واحدة (نحو 150 ميغابايت). ولا يلزم تنزيلها مجددًا عند تحديث نسخة مثبّتة."
LangString L_LICTOP ${LANG_ENGLISH} "Please read the license agreement. The privacy notice is installed next to the app."
LangString L_LICTOP ${LANG_SIMPCHINESE} "请阅读许可协议。隐私声明会安装在应用旁边。以英文版本为准。"
LangString L_LICTOP ${LANG_HINDI} "कृपया लाइसेंस अनुबंध पढ़ें। गोपनीयता सूचना ऐप के साथ इंस्टॉल होती है। अंग्रेज़ी पाठ ही मान्य संस्करण है।"
LangString L_LICTOP ${LANG_SPANISH} "Lee el contrato de licencia. El aviso de privacidad se instala junto a la aplicación. El texto en inglés es la versión vinculante."
LangString L_LICTOP ${LANG_ARABIC} "يُرجى قراءة اتفاقية الترخيص. يُثبَّت إشعار الخصوصية بجانب التطبيق. النص الإنجليزي هو النسخة المعتمدة."
LangString L_FTITLE ${LANG_ENGLISH} "${APP_NAME} is ready"
LangString L_FTITLE ${LANG_SIMPCHINESE} "${APP_NAME} 已准备就绪"
LangString L_FTITLE ${LANG_HINDI} "${APP_NAME} तैयार है"
LangString L_FTITLE ${LANG_SPANISH} "${APP_NAME} está listo"
LangString L_FTITLE ${LANG_ARABIC} "${APP_NAME} جاهز"
LangString L_FRUN ${LANG_ENGLISH} "Open ${APP_NAME} now"
LangString L_FRUN ${LANG_SIMPCHINESE} "立即打开 ${APP_NAME}"
LangString L_FRUN ${LANG_HINDI} "${APP_NAME} अभी खोलें"
LangString L_FRUN ${LANG_SPANISH} "Abrir ${APP_NAME} ahora"
LangString L_FRUN ${LANG_ARABIC} "افتح ${APP_NAME} الآن"
LangString L_CLOSING ${LANG_ENGLISH} "Closing ${APP_NAME} if it is running..."
LangString L_CLOSING ${LANG_SIMPCHINESE} "正在关闭 ${APP_NAME}（如果正在运行）..."
LangString L_CLOSING ${LANG_HINDI} "${APP_NAME} चल रहा हो तो उसे बंद किया जा रहा है..."
LangString L_CLOSING ${LANG_SPANISH} "Cerrando ${APP_NAME} si está abierto..."
LangString L_CLOSING ${LANG_ARABIC} "جارٍ إغلاق ${APP_NAME} إن كان قيد التشغيل..."
LangString L_FILES ${LANG_ENGLISH} "Installing application files..."
LangString L_FILES ${LANG_SIMPCHINESE} "正在安装应用文件..."
LangString L_FILES ${LANG_HINDI} "ऐप की फ़ाइलें इंस्टॉल हो रही हैं..."
LangString L_FILES ${LANG_SPANISH} "Instalando los archivos de la aplicación..."
LangString L_FILES ${LANG_ARABIC} "جارٍ تثبيت ملفات التطبيق..."
LangString L_RTOK ${LANG_ENGLISH} "App runtime is already up to date - skipping download."
LangString L_RTOK ${LANG_SIMPCHINESE} "应用运行环境已是最新版本，跳过下载。"
LangString L_RTOK ${LANG_HINDI} "ऐप रनटाइम पहले से अप-टू-डेट है - डाउनलोड छोड़ा जा रहा है।"
LangString L_RTOK ${LANG_SPANISH} "El entorno de ejecución ya está actualizado; se omite la descarga."
LangString L_RTOK ${LANG_ARABIC} "بيئة التشغيل محدَّثة بالفعل - تخطّي التنزيل."
LangString L_DL ${LANG_ENGLISH} "Downloading the app runtime (one time, ~150 MB)..."
LangString L_DL ${LANG_SIMPCHINESE} "正在下载应用运行环境（仅一次，约 150 MB）..."
LangString L_DL ${LANG_HINDI} "ऐप रनटाइम डाउनलोड हो रहा है (एक बार, ~150 MB)..."
LangString L_DL ${LANG_SPANISH} "Descargando el entorno de ejecución (una sola vez, ~150 MB)..."
LangString L_DL ${LANG_ARABIC} "جارٍ تنزيل بيئة تشغيل التطبيق (مرة واحدة، ~150 ميغابايت)..."
LangString L_DLCAP ${LANG_ENGLISH} "Downloading ${APP_NAME}"
LangString L_DLCAP ${LANG_SIMPCHINESE} "正在下载 ${APP_NAME}"
LangString L_DLCAP ${LANG_HINDI} "${APP_NAME} डाउनलोड हो रहा है"
LangString L_DLCAP ${LANG_SPANISH} "Descargando ${APP_NAME}"
LangString L_DLCAP ${LANG_ARABIC} "جارٍ تنزيل ${APP_NAME}"
LangString L_DLBAN ${LANG_ENGLISH} "Downloading the app runtime (about 150 MB).$\nThis only happens once."
LangString L_DLBAN ${LANG_SIMPCHINESE} "正在下载应用运行环境（约 150 MB）。$\n只需下载这一次。"
LangString L_DLBAN ${LANG_HINDI} "ऐप रनटाइम डाउनलोड हो रहा है (लगभग 150 MB)।$\nयह केवल एक बार होता है।"
LangString L_DLBAN ${LANG_SPANISH} "Descargando el entorno de ejecución (unos 150 MB).$\nSolo ocurre una vez."
LangString L_DLBAN ${LANG_ARABIC} "جارٍ تنزيل بيئة تشغيل التطبيق (نحو 150 ميغابايت).$\nيحدث هذا مرة واحدة فقط."
LangString L_DLRES ${LANG_ENGLISH} "The connection was interrupted. Retry?"
LangString L_DLRES ${LANG_SIMPCHINESE} "连接已中断。要重试吗？"
LangString L_DLRES ${LANG_HINDI} "कनेक्शन टूट गया। फिर से कोशिश करें?"
LangString L_DLRES ${LANG_SPANISH} "Se interrumpió la conexión. ¿Reintentar?"
LangString L_DLRES ${LANG_ARABIC} "انقطع الاتصال. هل تريد إعادة المحاولة؟"
LangString L_DLFAIL ${LANG_ENGLISH} "Download failed:"
LangString L_DLFAIL ${LANG_SIMPCHINESE} "下载失败："
LangString L_DLFAIL ${LANG_HINDI} "डाउनलोड विफल:"
LangString L_DLFAIL ${LANG_SPANISH} "Error en la descarga:"
LangString L_DLFAIL ${LANG_ARABIC} "فشل التنزيل:"
LangString L_DLMSG1 ${LANG_ENGLISH} "Could not download the app runtime"
LangString L_DLMSG1 ${LANG_SIMPCHINESE} "无法下载应用运行环境"
LangString L_DLMSG1 ${LANG_HINDI} "ऐप रनटाइम डाउनलोड नहीं हो सका"
LangString L_DLMSG1 ${LANG_SPANISH} "No se pudo descargar el entorno de ejecución"
LangString L_DLMSG1 ${LANG_ARABIC} "تعذّر تنزيل بيئة تشغيل التطبيق"
LangString L_DLMSG2 ${LANG_ENGLISH} "Check your internet connection and retry, or download"
LangString L_DLMSG2 ${LANG_SIMPCHINESE} "请检查网络连接后重试，或从以下地址下载"
LangString L_DLMSG2 ${LANG_HINDI} "अपना इंटरनेट कनेक्शन जाँचकर फिर से कोशिश करें, या डाउनलोड करें"
LangString L_DLMSG2 ${LANG_SPANISH} "Comprueba tu conexión a internet y vuelve a intentarlo, o descarga"
LangString L_DLMSG2 ${LANG_ARABIC} "تحقّق من اتصالك بالإنترنت وأعد المحاولة، أو نزِّل"
LangString L_DLMSG3 ${LANG_ENGLISH} "and place it next to this installer."
LangString L_DLMSG3 ${LANG_SIMPCHINESE} "并将其放在此安装程序旁边。"
LangString L_DLMSG3 ${LANG_HINDI} "और इसे इस इंस्टॉलर के पास रखें।"
LangString L_DLMSG3 ${LANG_SPANISH} "y colócalo junto a este instalador."
LangString L_DLMSG3 ${LANG_ARABIC} "وضعه بجانب برنامج التثبيت هذا."
LangString L_DLCANCEL ${LANG_ENGLISH} "Download cancelled."
LangString L_DLCANCEL ${LANG_SIMPCHINESE} "下载已取消。"
LangString L_DLCANCEL ${LANG_HINDI} "डाउनलोड रद्द किया गया।"
LangString L_DLCANCEL ${LANG_SPANISH} "Descarga cancelada."
LangString L_DLCANCEL ${LANG_ARABIC} "أُلغي التنزيل."
LangString L_LOCAL ${LANG_ENGLISH} "Using runtime found next to the installer."
LangString L_LOCAL ${LANG_SIMPCHINESE} "使用安装程序旁边找到的运行环境。"
LangString L_LOCAL ${LANG_HINDI} "इंस्टॉलर के पास मिला रनटाइम इस्तेमाल किया जा रहा है।"
LangString L_LOCAL ${LANG_SPANISH} "Usando el entorno de ejecución encontrado junto al instalador."
LangString L_LOCAL ${LANG_ARABIC} "استخدام بيئة التشغيل الموجودة بجانب برنامج التثبيت."
LangString L_VERIFY ${LANG_ENGLISH} "Verifying download..."
LangString L_VERIFY ${LANG_SIMPCHINESE} "正在校验下载内容..."
LangString L_VERIFY ${LANG_HINDI} "डाउनलोड की जाँच हो रही है..."
LangString L_VERIFY ${LANG_SPANISH} "Verificando la descarga..."
LangString L_VERIFY ${LANG_ARABIC} "جارٍ التحقق من التنزيل..."
LangString L_BADHASH ${LANG_ENGLISH} "The app runtime failed its integrity check. Please run setup again."
LangString L_BADHASH ${LANG_SIMPCHINESE} "应用运行环境未通过完整性校验。请重新运行安装程序。"
LangString L_BADHASH ${LANG_HINDI} "ऐप रनटाइम अखंडता जाँच में विफल रहा। कृपया सेटअप फिर से चलाएँ।"
LangString L_BADHASH ${LANG_SPANISH} "El entorno de ejecución no superó la comprobación de integridad. Vuelve a ejecutar el instalador."
LangString L_BADHASH ${LANG_ARABIC} "فشلت بيئة التشغيل في فحص السلامة. يُرجى تشغيل برنامج الإعداد مرة أخرى."
LangString L_UNPACK ${LANG_ENGLISH} "Installing the app runtime..."
LangString L_UNPACK ${LANG_SIMPCHINESE} "正在安装应用运行环境..."
LangString L_UNPACK ${LANG_HINDI} "ऐप रनटाइम इंस्टॉल हो रहा है..."
LangString L_UNPACK ${LANG_SPANISH} "Instalando el entorno de ejecución..."
LangString L_UNPACK ${LANG_ARABIC} "جارٍ تثبيت بيئة تشغيل التطبيق..."
LangString L_UNPACKFAIL ${LANG_ENGLISH} "Could not unpack the runtime:"
LangString L_UNPACKFAIL ${LANG_SIMPCHINESE} "无法解压运行环境："
LangString L_UNPACKFAIL ${LANG_HINDI} "रनटाइम अनपैक नहीं हो सका:"
LangString L_UNPACKFAIL ${LANG_SPANISH} "No se pudo descomprimir el entorno de ejecución:"
LangString L_UNPACKFAIL ${LANG_ARABIC} "تعذّر فك ضغط بيئة التشغيل:"
LangString L_SHORT ${LANG_ENGLISH} "Creating shortcuts..."
LangString L_SHORT ${LANG_SIMPCHINESE} "正在创建快捷方式..."
LangString L_SHORT ${LANG_HINDI} "शॉर्टकट बनाए जा रहे हैं..."
LangString L_SHORT ${LANG_SPANISH} "Creando accesos directos..."
LangString L_SHORT ${LANG_ARABIC} "جارٍ إنشاء الاختصارات..."
LangString L_DONE ${LANG_ENGLISH} "Done."
LangString L_DONE ${LANG_SIMPCHINESE} "完成。"
LangString L_DONE ${LANG_HINDI} "हो गया।"
LangString L_DONE ${LANG_SPANISH} "Listo."
LangString L_DONE ${LANG_ARABIC} "تم."
LangString L_UNDATA1 ${LANG_ENGLISH} "Also delete your financial data and backups?"
LangString L_UNDATA1 ${LANG_SIMPCHINESE} "同时删除你的财务数据和备份吗？"
LangString L_UNDATA1 ${LANG_HINDI} "क्या अपना वित्तीय डेटा और बैकअप भी हटाएँ?"
LangString L_UNDATA1 ${LANG_SPANISH} "¿Eliminar también tus datos financieros y copias de seguridad?"
LangString L_UNDATA1 ${LANG_ARABIC} "هل تريد أيضًا حذف بياناتك المالية ونسخك الاحتياطية؟"
LangString L_UNDATA2 ${LANG_ENGLISH} "Choose No to keep them in case you reinstall."
LangString L_UNDATA2 ${LANG_SIMPCHINESE} "选择“否”可保留它们，以便重新安装后继续使用。"
LangString L_UNDATA2 ${LANG_HINDI} "अगर आप फिर से इंस्टॉल करेंगे तो उन्हें रखने के लिए $\"नहीं$\" चुनें।"
LangString L_UNDATA2 ${LANG_SPANISH} "Elige No para conservarlos por si vuelves a instalar."
LangString L_UNDATA2 ${LANG_ARABIC} "اختر $\"لا$\" للاحتفاظ بها في حال أعدت التثبيت."

Var ZipPath
Var Downloaded

Section "Install" SecInstall
  SetDetailsPrint both
  DetailPrint "$(L_CLOSING)"
  nsExec::Exec 'taskkill /F /IM ${EXE}'
  Pop $0
  Sleep 400

  ; ---- 1. app files (small) ----
  ; Setup always installs a complete, current app: drop any update bundles downloaded earlier, so the version installed here
  ; is the one that runs (also when installing a lower version number over a test build).
  ; Only the updates folder is removed; your data, backups and settings are untouched.
  RMDir /r "$APPDATA\Penny\updates"
  DetailPrint "$(L_FILES)"
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
    DetailPrint "$(L_RTOK)"
    Goto shortcuts
  ${EndIf}

  StrCpy $Downloaded "0"
  StrCpy $ZipPath "$EXEDIR\${ELECTRON_ZIP}"
  ${IfNot} ${FileExists} "$ZipPath"
    StrCpy $ZipPath "$PLUGINSDIR\${ELECTRON_ZIP}"
    DetailPrint "$(L_DL)"
    retry_download:
    inetc::get /CAPTION "$(L_DLCAP)" /BANNER "$(L_DLBAN)" /RESUME "$(L_DLRES)" "${ELECTRON_URL}" "$ZipPath" /END
    Pop $0
    ${If} $0 != "OK"
      DetailPrint "$(L_DLFAIL) $0"
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(L_DLMSG1) ($0).$\r$\n$\r$\n$(L_DLMSG2) ${ELECTRON_ZIP}$\r$\n(github.com/electron/electron/releases/tag/v${ELECTRON_VER})$\r$\n$(L_DLMSG3)" IDRETRY retry_download
      Abort "$(L_DLCANCEL)"
    ${EndIf}
    StrCpy $Downloaded "1"
  ${Else}
    DetailPrint "$(L_LOCAL)"
  ${EndIf}

  ; ---- 3. verify integrity (pinned SHA-256) ----
  DetailPrint "$(L_VERIFY)"
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-FileHash -Algorithm SHA256 -LiteralPath $\'$ZipPath$\').Hash -ieq $\'${ELECTRON_SHA}$\') { exit 0 } else { exit 1 }"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    ${If} $Downloaded == "1"
      Delete "$ZipPath"
    ${EndIf}
    Abort "$(L_BADHASH)"
  ${EndIf}

  ; ---- 4. extract runtime ----
  DetailPrint "$(L_UNPACK)"
  nsisunz::UnzipToLog "$ZipPath" "$INSTDIR"
  Pop $0
  ${If} $0 != "success"
    Abort "$(L_UNPACKFAIL) $0"
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

  ; keep only the locale packs for the app languages (English, Chinese, Hindi, Spanish, Arabic)
  FindFirst $2 $3 "$INSTDIR\locales\*.pak"
  loc_loop:
    StrCmp $3 "" loc_done
    StrCmp $3 "en-US.pak" loc_next
    StrCmp $3 "zh-CN.pak" loc_next
    StrCmp $3 "zh-TW.pak" loc_next
    StrCmp $3 "hi.pak" loc_next
    StrCmp $3 "es.pak" loc_next
    StrCmp $3 "es-419.pak" loc_next
    StrCmp $3 "ar.pak" loc_next
    Delete "$INSTDIR\locales\$3"
    loc_next:
    FindNext $2 $3
    Goto loc_loop
  loc_done:
  FindClose $2

  ; ---- 5. shortcuts + uninstaller + Add/Remove Programs ----
  shortcuts:
  ; (1.10.1) Stamping the icon onto Penny.exe with rcedit is switched OFF while a data-key problem seen right after
  ; running the 1.10.1 installer is investigated. Shortcuts and the Apps list still use the Penny icon.
  ; a fresh name for the shortcut icon, so Windows cannot show a cached old one after an upgrade
  Delete "$INSTDIR\penny-*.ico"
  CopyFiles /SILENT "$INSTDIR\icon.ico" "$INSTDIR\penny-v${APP_VERSION}.ico"
  DetailPrint "$(L_SHORT)"
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
  DetailPrint "$(L_DONE)"
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
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(L_UNDATA1)$\r$\n$\r$\n$APPDATA\Penny$\r$\n$\r$\n$(L_UNDATA2)" IDNO skip_data
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
