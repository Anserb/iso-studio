using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ISOStudio.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new StudioWindow());
    }
}

internal sealed class StudioWindow : Form
{
    private const string AppName = "Linux Studio";
    private readonly CancellationTokenSource lifetime = new();
    private readonly Label status = new()
    {
        AutoSize = true,
        Anchor = AnchorStyles.None,
        ForeColor = Color.White,
        Text = "Εκκίνηση Linux Studio…",
    };
    private readonly Button browser = new()
    {
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Text = "Άνοιγμα στον browser",
        Visible = false,
    };
    private readonly WebView2 web = new() { Dock = DockStyle.Fill, Visible = false };
    private Process? server;
    private Uri? home;

    public StudioWindow()
    {
        Text = "Linux Studio — Εκκίνηση";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 850);
        MinimumSize = new Size(420, 540);
        BackColor = Color.FromArgb(13, 17, 25);
        Icon = SystemIcons.Application;

        var startup = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        startup.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        startup.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        status.Anchor = AnchorStyles.Bottom;
        browser.Anchor = AnchorStyles.Top;
        startup.Controls.Add(status, 0, 0);
        startup.Controls.Add(browser, 0, 1);
        Controls.Add(startup);
        Controls.Add(web);
        browser.Click += (_, _) => OpenBrowser();
    }

    protected override async void OnShown(EventArgs args)
    {
        base.OnShown(args);
        try
        {
            home = await StartServerAsync(lifetime.Token);
            if (lifetime.IsCancellationRequested) return;
        }
        catch (Exception error)
        {
            if (!lifetime.IsCancellationRequested)
                ShowError("Απέτυχε η εκκίνηση του Linux Studio.", error);
            return;
        }

        try
        {
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                                    "ISO Studio", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: data);
            if (lifetime.IsCancellationRequested) return;
            await web.EnsureCoreWebView2Async(environment);
            if (lifetime.IsCancellationRequested) return;
            web.CoreWebView2.NavigationStarting += (_, navigation) =>
            {
                navigation.Cancel = !Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var target)
                                    || target.Scheme != home.Scheme || target.Host != home.Host || target.Port != home.Port;
            };
            web.CoreWebView2.NewWindowRequested += (_, request) =>
            {
                request.Handled = true;
                if (request.IsUserInitiated && Uri.TryCreate(request.Uri, UriKind.Absolute, out var target)
                    && target.Scheme == Uri.UriSchemeHttps && target.Host == "linuxstudio.pvgaming.uk"
                    && target.IsDefaultPort && target.AbsolutePath == "/guide")
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo(target.AbsoluteUri) { UseShellExecute = true })?.Dispose();
                    }
                    catch (System.ComponentModel.Win32Exception error)
                    {
                        MessageBox.Show(this, error.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
            };
            web.NavigationCompleted += (_, navigation) =>
            {
                if (navigation.IsSuccess)
                {
                    Text = AppName;
                    web.Visible = true;
                    web.BringToFront();
                }
                else if (navigation.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                {
                    OfferBrowser();
                }
            };
            web.Source = home;
        }
        catch (Exception) when (!lifetime.IsCancellationRequested)
        {
            OfferBrowser();
        }
        catch (Exception) when (lifetime.IsCancellationRequested)
        {
            // The window was closed during WebView initialization.
        }
    }

    private async Task<Uri> StartServerAsync(CancellationToken cancellation)
    {
        var baseDirectory = AppContext.BaseDirectory;
        var bundledNode = Path.Combine(baseDirectory, "runtime", "node.exe");
        var start = new ProcessStartInfo
        {
            FileName = File.Exists(bundledNode) ? bundledNode : "node.exe",
            WorkingDirectory = Path.Combine(baseDirectory, "app"),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
        };
        start.ArgumentList.Add(Path.Combine(start.WorkingDirectory, "server.mjs"));
        start.Environment["PORT"] = "0";
        start.Environment["LINUX_STUDIO_WINDOWS_HOST"] = "1";
        start.Environment.Remove("LINUX_STUDIO_WINDOWS_SETUP");
        if (File.Exists(bundledNode) && Directory.EnumerateFiles(baseDirectory, "unins*.exe").Any())
            start.Environment["LINUX_STUDIO_WINDOWS_SETUP"] = "1";
        start.Environment.Remove("NODE_OPTIONS");
        server = Process.Start(start) ?? throw new InvalidOperationException("Node.js did not start.");
        var errors = server.StandardError.ReadToEndAsync(cancellation);
        using var startup = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        startup.CancelAfter(TimeSpan.FromSeconds(15));
        var line = await server.StandardOutput.ReadLineAsync(startup.Token);
        const string prefix = "Linux Studio · ";
        if (line?.StartsWith(prefix, StringComparison.Ordinal) == true
            && Uri.TryCreate(line[prefix.Length..], UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttp && uri.Host == "127.0.0.1")
        {
            _ = WatchUpdatesAsync(server.StandardOutput, cancellation);
            return uri;
        }
        var detail = await errors.WaitAsync(startup.Token);
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail) ? "No address was returned by the server." : detail);
    }

    private async Task WatchUpdatesAsync(StreamReader output, CancellationToken cancellation)
    {
        try
        {
            while (await output.ReadLineAsync(cancellation) is { } line)
            {
                if (line == "Linux Studio · update-started")
                {
                    BeginInvoke(new Action(Close));
                    return;
                }
                if (line == "Linux Studio · enable-wsl") BeginInvoke(new Action(EnableWsl));
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        catch (InvalidOperationException) { }
    }

    private void EnableWsl()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "wsl.exe"))
            {
                Arguments = "--install --no-distribution",
                UseShellExecute = true,
                Verb = "runas",
            });
        }
        catch (System.ComponentModel.Win32Exception error)
        {
            MessageBox.Show(this, error.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OfferBrowser()
    {
        web.Visible = false;
        Text = AppName + " — Browser";
        status.Text = "Το παράθυρο προεπισκόπησης δεν άνοιξε.";
        browser.Visible = true;
    }

    private void OpenBrowser()
    {
        if (home is null) return;
        try
        {
            Process.Start(new ProcessStartInfo(home.AbsoluteUri) { UseShellExecute = true })?.Dispose();
            status.Text = "Άφησε αυτό το παράθυρο ανοιχτό όσο χρησιμοποιείς το Linux Studio.";
        }
        catch (Exception error)
        {
            ShowError("Απέτυχε το άνοιγμα του browser.", error);
        }
    }

    private void ShowError(string message, Exception error)
    {
        status.Text = message;
        MessageBox.Show(this, message + Environment.NewLine + error.Message, AppName,
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            lifetime.Cancel();
            try
            {
                if (server is { HasExited: false }) server.Kill();
            }
            catch (InvalidOperationException)
            {
                // It exited between the check and Kill.
            }
            finally
            {
                server?.Dispose();
            }
        }
        base.Dispose(disposing);
    }
}
