#define AppName "ChatGPT2Doc WPS Helper"
#define AppVersion "1.0.0"
#define HostName "com.chat_export_local.wps"
#ifndef DefaultExtensionId
#define DefaultExtensionId ""
#endif

[Setup]
AppId={{6E5E9333-2575-45C2-9AF8-81B7C6C95747}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=ChatGPT2Doc
AppPublisherURL=https://github.com/Throb7777/chatgpt2doc
AppSupportURL=https://github.com/Throb7777/chatgpt2doc/issues
AppUpdatesURL=https://github.com/Throb7777/chatgpt2doc/releases
DefaultDirName={localappdata}\ChatGPT2Doc\WpsHelper
DefaultGroupName=ChatGPT2Doc
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=chatgpt2doc-wps-helper-setup-v1.0.0
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\ChatExportWpsHost.exe
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\ChatExportWpsHost.exe"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#HostName}.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#HostName}.json"; Flags: uninsdeletekey

[UninstallDelete]
Type: files; Name: "{app}\{#HostName}.json"
Type: files; Name: "{app}\install.log"

[Code]
var
  ExtensionPage: TInputQueryWizardPage;

function TrimmedExtensionIds(Value: String): String;
begin
  Result := Trim(Value);
  StringChangeEx(Result, ';', ',', True);
  StringChangeEx(Result, ' ', ',', True);
  StringChangeEx(Result, #9, ',', True);
  while Pos(',,', Result) > 0 do
    StringChangeEx(Result, ',,', ',', True);
  while (Length(Result) > 0) and (Copy(Result, 1, 1) = ',') do
    Delete(Result, 1, 1);
  while (Length(Result) > 0) and (Copy(Result, Length(Result), 1) = ',') do
    Delete(Result, Length(Result), 1);
end;

function IsExtensionId(Value: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := Length(Value) = 32;
  if not Result then
    Exit;
  for I := 1 to Length(Value) do
  begin
    C := Value[I];
    if not ((C >= 'a') and (C <= 'p')) then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function ExtensionIdsAreValid(Value: String): Boolean;
var
  Normalized: String;
  Item: String;
  Comma: Integer;
begin
  Normalized := TrimmedExtensionIds(Value);
  Result := Normalized <> '';
  while Result and (Normalized <> '') do
  begin
    Comma := Pos(',', Normalized);
    if Comma > 0 then
    begin
      Item := Copy(Normalized, 1, Comma - 1);
      Delete(Normalized, 1, Comma);
    end
    else
    begin
      Item := Normalized;
      Normalized := '';
    end;
    Result := IsExtensionId(Item);
  end;
end;

function JsonEscape(Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

function JsonAllowedOrigins(Value: String): String;
var
  Normalized: String;
  Item: String;
  Comma: Integer;
begin
  Result := '';
  Normalized := TrimmedExtensionIds(Value);
  while Normalized <> '' do
  begin
    Comma := Pos(',', Normalized);
    if Comma > 0 then
    begin
      Item := Copy(Normalized, 1, Comma - 1);
      Delete(Normalized, 1, Comma);
    end
    else
    begin
      Item := Normalized;
      Normalized := '';
    end;
    if Result <> '' then
      Result := Result + ',' + #13#10 + '    ';
    Result := Result + '"chrome-extension://' + Item + '/"';
  end;
end;

function NativeManifestJson(ExtensionIds: String): String;
begin
  Result :=
    '{' + #13#10 +
    '  "name": "{#HostName}",' + #13#10 +
    '  "description": "ChatGPT2Doc WPS Office editable equation helper",' + #13#10 +
    '  "path": "' + JsonEscape(ExpandConstant('{app}\ChatExportWpsHost.exe')) + '",' + #13#10 +
    '  "type": "stdio",' + #13#10 +
    '  "allowed_origins": [' + #13#10 +
    '    ' + JsonAllowedOrigins(ExtensionIds) + #13#10 +
    '  ]' + #13#10 +
    '}' + #13#10;
end;

procedure InitializeWizard;
begin
  ExtensionPage := CreateInputQueryPage(
    wpSelectDir,
    'Bind ChatGPT2Doc extension',
    'Enter the Chrome or Edge extension ID allowed to use this helper.',
    'For the Chrome Web Store version this field may already be filled. For local/developer installs, copy the current extension ID from ChatGPT2Doc settings. Separate multiple IDs with commas.'
  );
  ExtensionPage.Add('Extension ID:', False);
  ExtensionPage.Values[0] := '{#DefaultExtensionId}';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ExtensionPage.ID then
  begin
    ExtensionPage.Values[0] := TrimmedExtensionIds(ExtensionPage.Values[0]);
    if not ExtensionIdsAreValid(ExtensionPage.Values[0]) then
    begin
      MsgBox('Enter at least one valid 32-character Chrome/Edge extension ID. The ID uses letters a through p only.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ManifestPath: String;
  LogPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    ManifestPath := ExpandConstant('{app}\{#HostName}.json');
    SaveStringToFile(ManifestPath, NativeManifestJson(ExtensionPage.Values[0]), False);
    LogPath := ExpandConstant('{app}\install.log');
    SaveStringToFile(
      LogPath,
      'installed=true' + #13#10 +
      'host={#HostName}' + #13#10 +
      'manifest=' + ManifestPath + #13#10 +
      'extensionIds=' + ExtensionPage.Values[0] + #13#10,
      False
    );
  end;
end;
