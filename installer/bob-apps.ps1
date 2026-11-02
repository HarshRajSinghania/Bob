# Bob's Apps hand helper. Bob starts it while he uses apps (only when the Apps hand is on, and only after
# you approve an action) and it ends when Bob closes it, goes idle, or Bob himself exits (stdin closes).
#
# It talks JSON lines: Bob writes {"id":..,"op":..} on stdin, it answers {"id":..,"ok":true,...} on stdout.
#   hello                      -> version
#   windows                    -> open top-level windows: hwnd, title, process, pid
#   apps                       -> Start menu apps: name, appId (Get-StartApps)
#   open    appId              -> opens it through the shell (as you, never "run as administrator")
#   look    hwnd, max          -> the window's controls through UI Automation: type, name, id, enabled, value
#                                 (never the value of a password field)
#   picture hwnd, file         -> a PNG of that window
#   drive   on                 -> shows / hides the red "Bob is driving" bar and watches for you taking over
#   act     hwnd, action, target{type,name,id,nth}, text, keys
#                              -> click / type / keys / focus, only while driving
#   quit
# While driving, moving the mouse or pressing Esc stops at once and it writes {"event":"stopped","why":...}.
#
# Never touches: terminals, admin tools, password managers, sign-in or security prompts, password fields,
# or Bob's own window (-BobPid / -BobParent). Windows PowerShell 5.1, plain ASCII, run with -STA.
param([int] $BobPid = 0, [int] $BobParent = 0)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing, WindowsBase
if (-not ('BobApps.Driver' -as [type])) {
  Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing, WindowsBase -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

namespace BobApps {
  public class Banner : Form {
    public Banner() {
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      BackColor = Color.FromArgb(178, 34, 34);
      Opacity = 0.92;
      StartPosition = FormStartPosition.Manual;
      Rectangle s = Screen.PrimaryScreen.Bounds;
      Bounds = new Rectangle(s.Left, s.Top, s.Width, 46);
      Label l = new Label();
      l.Dock = DockStyle.Fill;
      l.ForeColor = Color.White;
      l.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
      l.TextAlign = ContentAlignment.MiddleCenter;
      l.Text = "Bob is driving.  Move the mouse or press Esc to take back control.";
      Controls.Add(l);
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
      get {
        CreateParams cp = base.CreateParams;
        // topmost, no activation, tool window (no Alt+Tab), click-through
        cp.ExStyle |= 0x00000008 | 0x08000000 | 0x00000080 | 0x00000020 | 0x00080000;
        return cp;
      }
    }
  }

  public static class Driver {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    static readonly object OutLock = new object();
    static readonly string[] Blocked = new string[] {
      "cmd", "powershell", "pwsh", "powershell_ise", "windowsterminal", "wt", "conhost", "openconsole", "wsl", "bash", "wscript", "cscript", "mshta",
      "regedit", "mmc", "taskmgr", "msconfig", "gpedit", "secpol", "compmgmt", "diskmgmt", "eventvwr", "services", "perfmon", "resmon",
      "systempropertiesadvanced", "useraccountcontrolsettings", "netplwiz", "lusrmgr", "control", "sysdm",
      "consent", "credentialuibroker", "logonui", "lockapp", "sechealthui", "securityhealthsystray", "securityhealthhost", "msmpeng", "smartscreen", "useraccountbroker",
      "keepass", "keepassxc", "1password", "bitwarden", "dashlane", "lastpass", "enpass", "nordpass", "roboform", "keeper", "protonpass",
      "bob", "electron" };
    public static int[] OwnPids = new int[0];

    static volatile bool driving = false;
    static volatile bool stopped = false;
    static long quietUntil = 0;
    static POINT baseline;
    static Thread watcher;
    static Banner banner;
    static Thread uiThread;
    static readonly ManualResetEvent uiReady = new ManualResetEvent(false);

    public static void Emit(string line) { lock (OutLock) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

    static string ProcName(uint pid) {
      try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
    }
    static bool IsBlocked(IntPtr h, out string why) {
      why = "";
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == (uint)Process.GetCurrentProcess().Id || Array.IndexOf(OwnPids, (int)pid) >= 0) { why = "That is Bob's own window."; return true; }
      string n = ProcName(pid).ToLowerInvariant();
      if (Array.IndexOf(Blocked, n) >= 0) { why = n + " is off limits to the Apps hand."; return true; }
      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      string t = sb.ToString().ToLowerInvariant();
      string[] words = new string[] { "password", "passphrase", "credential", "windows security", "user account control", "bitlocker", "recovery key" };
      foreach (string w in words) if (t.Contains(w)) { why = "That window looks like a password or security prompt."; return true; }
      return false;
    }

    public static List<Dictionary<string, object>> ListWindows() {
      List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
      int me = Process.GetCurrentProcess().Id;
      EnumWindows(delegate (IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true; // visible, not owned
        int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
        StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
        if (sb.Length == 0) return true;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if ((int)pid == me) return true;
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["hwnd"] = h.ToInt64(); d["title"] = sb.ToString(); d["pid"] = (int)pid; d["process"] = ProcName(pid);
        list.Add(d);
        return true;
      }, IntPtr.Zero);
      return list;
    }

    static IntPtr Window(long hwnd) {
      IntPtr h = new IntPtr(hwnd);
      if (!IsWindow(h)) throw new Exception("That window has closed.");
      string why; if (IsBlocked(h, out why)) throw new Exception(why);
      return h;
    }

    static string TypeName(AutomationElement e) {
      string n = e.Current.ControlType.ProgrammaticName;
      return n.StartsWith("ControlType.") ? n.Substring(12) : n;
    }

    public static List<Dictionary<string, object>> Look(long hwnd, int max) {
      IntPtr h = Window(hwnd);
      AutomationElement root = AutomationElement.FromHandle(h);
      List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
      TreeWalker walk = TreeWalker.ControlViewWalker;
      Stack<KeyValuePair<AutomationElement, int>> todo = new Stack<KeyValuePair<AutomationElement, int>>();
      todo.Push(new KeyValuePair<AutomationElement, int>(root, 0));
      int seen = 0;
      while (todo.Count > 0 && list.Count < max && seen < 3000) {
        KeyValuePair<AutomationElement, int> kv = todo.Pop(); seen++;
        AutomationElement e = kv.Key;
        try {
          if (kv.Value > 0 && !e.Current.IsOffscreen) {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["type"] = TypeName(e); d["name"] = e.Current.Name ?? ""; d["id"] = e.Current.AutomationId ?? ""; d["enabled"] = e.Current.IsEnabled;
            bool pw = e.Current.IsPassword; d["password"] = pw;
            object vp;
            if (!pw && e.TryGetCurrentPattern(ValuePattern.Pattern, out vp)) {
              string v = ((ValuePattern)vp).Current.Value ?? "";
              if (v.Length > 0) d["value"] = v.Length > 80 ? v.Substring(0, 80) : v;
            }
            if (((string)d["name"]).Length > 0 || ((string)d["id"]).Length > 0 || (string)d["type"] == "Edit") list.Add(d);
          }
          if (kv.Value < 12) {
            List<AutomationElement> kids = new List<AutomationElement>();
            AutomationElement c = walk.GetFirstChild(e);
            while (c != null && kids.Count < 400) { kids.Add(c); c = walk.GetNextSibling(c); }
            for (int i = kids.Count - 1; i >= 0; i--) todo.Push(new KeyValuePair<AutomationElement, int>(kids[i], kv.Value + 1));
          }
        } catch (ElementNotAvailableException) { }
      }
      return list;
    }

    public static string Picture(long hwnd, string file) {
      IntPtr h = Window(hwnd);
      RECT r; GetWindowRect(h, out r);
      int w = Math.Max(1, r.Right - r.Left), ht = Math.Max(1, r.Bottom - r.Top);
      using (Bitmap bmp = new Bitmap(w, ht)) {
        using (Graphics g = Graphics.FromImage(bmp)) {
          IntPtr hdc = g.GetHdc();
          bool ok = PrintWindow(h, hdc, 2);
          g.ReleaseHdc(hdc);
          if (!ok) g.CopyFromScreen(r.Left, r.Top, 0, 0, new Size(w, ht));
        }
        bmp.Save(file, ImageFormat.Png);
      }
      return file;
    }

    // ---- driving: the red bar and the watch for the user taking over ----
    static void UiLoop() {
      banner = new Banner();
      IntPtr force = banner.Handle; // create the handle on this thread
      uiReady.Set();
      Application.Run();
    }
    static void ShowBanner(bool on) {
      if (uiThread == null) {
        uiThread = new Thread(UiLoop); uiThread.IsBackground = true; uiThread.SetApartmentState(ApartmentState.STA); uiThread.Start();
        uiReady.WaitOne(5000);
      }
      if (banner == null) return;
      try { banner.BeginInvoke((MethodInvoker)delegate { if (on) banner.Show(); else banner.Hide(); }); } catch { }
    }
    static void Quiet(int ms) { Interlocked.Exchange(ref quietUntil, DateTime.UtcNow.AddMilliseconds(ms).Ticks); }
    static void Watch() {
      while (true) {
        Thread.Sleep(40);
        if (!driving) continue;
        POINT p; GetCursorPos(out p);
        if (DateTime.UtcNow.Ticks < Interlocked.Read(ref quietUntil)) { baseline = p; continue; }
        int dx = p.X - baseline.X, dy = p.Y - baseline.Y;
        if (dx * dx + dy * dy > 30 * 30) { StopNow("mouse"); continue; }
        if ((GetAsyncKeyState(0x1B) & 0x8000) != 0) StopNow("esc");
      }
    }
    static void StopNow(string why) {
      if (!driving) return;
      driving = false; stopped = true;
      ShowBanner(false);
      Emit("{\"event\":\"stopped\",\"why\":\"" + why + "\"}");
    }
    public static void Drive(bool on) {
      if (on) {
        stopped = false;
        GetCursorPos(out baseline);
        Quiet(150);
        driving = true;
        if (watcher == null) { watcher = new Thread(Watch); watcher.IsBackground = true; watcher.Start(); }
        ShowBanner(true);
      } else {
        driving = false;
        ShowBanner(false);
      }
    }

    static ControlType TypeOf(string name) {
      if (String.IsNullOrEmpty(name)) return null;
      System.Reflection.FieldInfo f = typeof(ControlType).GetField(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.IgnoreCase);
      return f == null ? null : (ControlType)f.GetValue(null);
    }

    static AutomationElement Find(IntPtr h, string type, string name, string id, int nth) {
      AutomationElement root = AutomationElement.FromHandle(h);
      List<Condition> cs = new List<Condition>();
      ControlType ct = TypeOf(type);
      if (ct != null) cs.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, ct));
      if (!String.IsNullOrEmpty(name)) cs.Add(new PropertyCondition(AutomationElement.NameProperty, name, PropertyConditionFlags.IgnoreCase));
      if (!String.IsNullOrEmpty(id)) cs.Add(new PropertyCondition(AutomationElement.AutomationIdProperty, id, PropertyConditionFlags.IgnoreCase));
      if (cs.Count == 0) return root;
      Condition c = cs.Count == 1 ? cs[0] : new AndCondition(cs.ToArray());
      AutomationElementCollection all = root.FindAll(TreeScope.Descendants, c);
      if (all.Count == 0) throw new Exception("Couldn't find that in the window. Look again, the window may have changed.");
      int i = Math.Max(1, nth) - 1;
      if (i >= all.Count) throw new Exception("There are only " + all.Count + " of those.");
      return all[i];
    }

    static string SendKeysEscape(string s) {
      StringBuilder b = new StringBuilder();
      foreach (char c in s) {
        if ("+^%~(){}[]".IndexOf(c) >= 0) b.Append('{').Append(c).Append('}');
        else if (c == '\n') b.Append("{ENTER}");
        else if (c != '\r') b.Append(c);
      }
      return b.ToString();
    }

    static void Front(IntPtr h) {
      if (IsIconic(h)) ShowWindow(h, 9);
      SetForegroundWindow(h);
      Thread.Sleep(120);
    }

    public static string Act(long hwnd, string action, string type, string name, string id, int nth, string text, string keys) {
      if (stopped) throw new Exception("Stopped: you took back control.");
      if (!driving) throw new Exception("Bob isn't driving right now.");
      IntPtr h = Window(hwnd);
      AutomationElement e = Find(h, type, name, id, nth);
      if (!e.Current.IsEnabled) throw new Exception("That is greyed out.");
      string label = TypeName(e) + " \"" + e.Current.Name + "\"";
      Quiet(400);
      Front(h);
      object p;
      if (action == "click") {
        if (e.TryGetCurrentPattern(InvokePattern.Pattern, out p)) { ((InvokePattern)p).Invoke(); return "pressed " + label; }
        if (e.TryGetCurrentPattern(TogglePattern.Pattern, out p)) { ((TogglePattern)p).Toggle(); return "toggled " + label; }
        if (e.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) { ((SelectionItemPattern)p).Select(); return "selected " + label; }
        if (e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out p)) {
          ExpandCollapsePattern ec = (ExpandCollapsePattern)p;
          if (ec.Current.ExpandCollapseState == ExpandCollapseState.Expanded) ec.Collapse(); else ec.Expand();
          return "opened or closed " + label;
        }
        // Last resort: a real click in the middle of it, then the pointer goes back where it was.
        System.Windows.Point pt;
        if (!e.TryGetClickablePoint(out pt)) {
          System.Windows.Rect rc = e.Current.BoundingRectangle;
          if (rc.IsEmpty) throw new Exception("Couldn't find where to click.");
          pt = new System.Windows.Point(rc.Left + rc.Width / 2, rc.Top + rc.Height / 2);
        }
        POINT old; GetCursorPos(out old);
        Quiet(600);
        SetCursorPos((int)pt.X, (int)pt.Y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(60);
        SetCursorPos(old.X, old.Y);
        Quiet(300);
        return "clicked " + label;
      }
      if (action == "type") {
        if (e.Current.IsPassword) throw new Exception("Bob never types into password fields.");
        if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p) && !((ValuePattern)p).Current.IsReadOnly) { ((ValuePattern)p).SetValue(text); return "typed into " + label; }
        e.SetFocus();
        Quiet(200 + text.Length * 15);
        SendKeys.SendWait(SendKeysEscape(text));
        return "typed into " + label;
      }
      if (action == "keys") {
        if (e.Current.IsPassword) throw new Exception("Bob never types into password fields.");
        if (keys.IndexOf("{ESC}", StringComparison.OrdinalIgnoreCase) >= 0) Quiet(400);
        try { e.SetFocus(); } catch { }
        SendKeys.SendWait(keys);
        return "pressed keys in " + label;
      }
      if (action == "focus") { e.SetFocus(); return "put the cursor in " + label; }
      throw new Exception("Unknown action.");
    }
  }
}
'@
}
[BobApps.Driver]::OwnPids = [int[]]@($BobPid, $BobParent | Where-Object { $_ -gt 0 })

function Inner($err) { $e = $err.Exception; while ($e.InnerException) { $e = $e.InnerException }; return $e.Message }

$quit = $false
while (-not $quit) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  try { $m = $line | ConvertFrom-Json } catch { continue }
  $r = @{ id = $m.id; ok = $true }
  try {
    switch ([string]$m.op) {
      'hello' { $r.version = 1 }
      'windows' { $r.windows = @([BobApps.Driver]::ListWindows()) }
      'apps' { $r.apps = @(Get-StartApps | Select-Object -First 500 | ForEach-Object { @{ name = $_.Name; appId = $_.AppID } }) }
      'open' {
        $id = [string]$m.appId
        if (-not $id -or $id.Length -gt 300 -or $id -match '["<>|]') { throw 'That is not a Start menu app.' }
        if (-not (Get-StartApps | Where-Object { $_.AppID -eq $id })) { throw 'That app is not in the Start menu.' }
        Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('shell:AppsFolder\' + $id)
      }
      'look' { $r.items = @([BobApps.Driver]::Look([long]$m.hwnd, [Math]::Min(300, [Math]::Max(10, [int]$m.max)))) }
      'picture' {
        $f = [string]$m.file
        if (-not $f.ToLower().EndsWith('.png')) { throw 'Pictures are saved as .png.' }
        $r.file = [BobApps.Driver]::Picture([long]$m.hwnd, $f)
      }
      'drive' { [BobApps.Driver]::Drive([bool]$m.on) }
      'act' {
        $t = $m.target
        $r.did = [BobApps.Driver]::Act([long]$m.hwnd, [string]$m.action, [string]$t.type, [string]$t.name, [string]$t.id, [int]$t.nth, [string]$m.text, [string]$m.keys)
      }
      'quit' { [BobApps.Driver]::Drive($false); $quit = $true }
      default { throw "Unknown request: $($m.op)" }
    }
  } catch { $r.ok = $false; $r.error = Inner $_ }
  [BobApps.Driver]::Emit(($r | ConvertTo-Json -Compress -Depth 6))
}
[BobApps.Driver]::Drive($false)
