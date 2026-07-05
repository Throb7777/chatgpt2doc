param(
    [Parameter(Mandatory = $true)]
    [string]$FolderPath,

    [Parameter(Mandatory = $true)]
    [ValidateSet('chrome', 'msedge')]
    [string]$BrowserName
)

$ErrorActionPreference = 'Stop'

$resolvedPath = [System.IO.Path]::GetFullPath($FolderPath)
if (-not (Test-Path -LiteralPath $resolvedPath -PathType Container)) {
    throw "Extension folder does not exist: $resolvedPath"
}
if ($resolvedPath -notmatch '^[A-Za-z]:\\[A-Za-z0-9 _.\\-]+$') {
    throw "Folder path contains characters unsafe for SendKeys: $resolvedPath"
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class FolderDialogFinder {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(
        IntPtr hWnd,
        uint message,
        IntPtr wParam,
        string lParam
    );

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(
        IntPtr hWnd,
        uint message,
        IntPtr wParam,
        IntPtr lParam
    );

    public static void SetText(IntPtr hWnd, string text) {
        SendMessage(hWnd, 0x000C, IntPtr.Zero, text);
    }

    public static void Click(IntPtr hWnd) {
        SendMessage(hWnd, 0x00F5, IntPtr.Zero, IntPtr.Zero);
    }

    public static IntPtr Find(string processName) {
        IntPtr match = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;

            var className = new StringBuilder(64);
            GetClassName(hWnd, className, className.Capacity);
            if (className.ToString() != "#32770") return true;

            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            try {
                if (Process.GetProcessById((int)processId).ProcessName.Equals(
                    processName,
                    StringComparison.OrdinalIgnoreCase
                )) {
                    match = hWnd;
                    return false;
                }
            } catch {
                return true;
            }
            return true;
        }, IntPtr.Zero);
        return match;
    }
}
'@

$deadline = (Get-Date).AddSeconds(20)
$dialog = [IntPtr]::Zero
while ((Get-Date) -lt $deadline -and $dialog -eq [IntPtr]::Zero) {
    $dialog = [FolderDialogFinder]::Find($BrowserName)
    if ($dialog -eq [IntPtr]::Zero) {
        Start-Sleep -Milliseconds 100
    }
}
if ($dialog -eq [IntPtr]::Zero) {
    throw "Timed out waiting for the $BrowserName folder dialog."
}

$rootElement = [System.Windows.Automation.AutomationElement]::FromHandle($dialog)
$pathCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1152'
)
$pathEdit = $rootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $pathCondition
)
if ($null -eq $pathEdit) {
    throw 'Folder path input with AutomationId 1152 was not found.'
}
$pathHandle = [IntPtr]$pathEdit.Current.NativeWindowHandle
if ($pathHandle -eq [IntPtr]::Zero) {
    throw 'Folder path input has no native window handle.'
}
[FolderDialogFinder]::SetText($pathHandle, $resolvedPath)

$buttonIdCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1'
)
$buttonClassCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty,
    'Button'
)
$buttonCondition = [System.Windows.Automation.AndCondition]::new(
    [System.Windows.Automation.Condition[]]@($buttonIdCondition, $buttonClassCondition)
)
$selectButton = $rootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $buttonCondition
)
if ($null -eq $selectButton -or -not $selectButton.Current.IsEnabled) {
    throw 'Enabled select-folder button was not found.'
}
$buttonHandle = [IntPtr]$selectButton.Current.NativeWindowHandle
if ($buttonHandle -eq [IntPtr]::Zero) {
    throw 'Select-folder button has no native window handle.'
}
[FolderDialogFinder]::Click($buttonHandle)

$closeDeadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $closeDeadline -and [FolderDialogFinder]::IsWindow($dialog)) {
    Start-Sleep -Milliseconds 100
}
if ([FolderDialogFinder]::IsWindow($dialog)) {
    throw "The $BrowserName folder dialog did not close after selecting $resolvedPath."
}

Write-Output $resolvedPath
