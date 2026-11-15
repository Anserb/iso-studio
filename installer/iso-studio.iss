#define AppName "Linux Studio"
#define AppExe "ISOStudio.exe"

[Setup]
AppId={{B1E2A2D8-5A50-4C8A-8A13-6F7F9D2C0F31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Anserb
DefaultDirName={localappdata}\Programs\Linux Studio
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputBaseFilename=LinuxStudioSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dark
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{autoprograms}\ISO Studio.lnk"
Type: files; Name: "{autodesktop}\ISO Studio.lnk"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
