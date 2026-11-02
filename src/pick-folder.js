// 1.5.34: Windows' own "pick a folder" window, for Settings > Projects (so nobody has to type a path).
// Runs PowerShell's FolderBrowserDialog on top of Bob's window. Returns the folder, or '' if cancelled.
import { execFile } from 'node:child_process';

const SCRIPT = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$d.Description = 'Pick a project folder for Bob'",
  '$d.ShowNewFolderButton = $false',
  "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
  '$owner.Dispose()'
].join('; ');

export function pickFolder({ run = execFile, platform = process.platform } = {}) {
  if (platform !== 'win32') return Promise.reject(new Error('Picking a folder this way only works on Windows. Type the folder instead.'));
  return new Promise((resolve, reject) => {
    run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { timeout: 10 * 60e3, windowsHide: true }, (err, out) => {
      if (err && !String(out || '').trim()) return reject(new Error("Windows' folder picker didn't open. Type the folder instead."));
      resolve(String(out || '').trim());
    });
  });
}
