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
SetupIconFile=..\assets\linux-studio.ico
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
Filename: "{app}\{#AppExe}"; Flags: nowait skipifnotsilent; Check: RelaunchRequested

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  NoticeDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    NoticeDir := ExpandConstant('{localappdata}\linux-studio\updates');
    if ForceDirectories(NoticeDir) then
      SaveStringToFile(NoticeDir + '\last-install.json', '{"version":"{#AppVersion}"}', False);
  end;
end;

function RelaunchRequested: Boolean;
begin
  Result := ExpandConstant('{param:RELAUNCH|0}') = '1';
end;
