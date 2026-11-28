using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
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
    private readonly Icon brandIcon = LoadBrandIcon();
    private readonly Image brandImage = LoadBrandImage();
    private Process? server;
    private Uri? home;
    private bool darkCaption = true;
    private Color captionBackground = Color.FromArgb(11, 18, 32);
    private Color captionForeground = Color.FromArgb(239, 246, 255);

    [DllImport("dwmapi.dll", ExactSpelling = true)]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    private void ApplyWindowTheme()
    {
        if (!IsHandleCreated) return;
        var dark = darkCaption ? 1 : 0;
        var background = ColorTranslator.ToWin32(captionBackground);
        var foreground = ColorTranslator.ToWin32(captionForeground);
        // Custom caption colors are available on Windows 11; older Windows keeps the dark/light frame.
        _ = DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        _ = DwmSetWindowAttribute(Handle, 35, ref background, sizeof(int));
        _ = DwmSetWindowAttribute(Handle, 36, ref foreground, sizeof(int));
    }

    protected override void OnHandleCreated(EventArgs args)
    {
        base.OnHandleCreated(args);
        ApplyWindowTheme();
    }

    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);
        if (message.Msg is 0x031A or 0x031E or 0x001A) ApplyWindowTheme();
    }

    private static bool TryReadColor(JsonElement root, string property, out Color color)
    {
        color = default;
        if (!root.TryGetProperty(property, out var element) || element.ValueKind != JsonValueKind.String) return false;
        var text = element.GetString();
        if (text is not { Length: 7 } || text[0] != '#'
            || !int.TryParse(text.AsSpan(1), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var rgb)) return false;
        color = Color.FromArgb((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
        return true;
    }

    private void ReceiveAppearance(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (home is null || !Uri.TryCreate(args.Source, UriKind.Absolute, out var source)
            || source.Scheme != home.Scheme || source.Host != home.Host || source.Port != home.Port || source.AbsolutePath != "/") return;
        if (args.WebMessageAsJson.Length > 1024) return;
        try
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var type) || type.GetString() != "appearance"
                || !root.TryGetProperty("theme", out var theme) || theme.ValueKind != JsonValueKind.String
                || theme.GetString() is not ("dark" or "light")
                || !TryReadColor(root, "background", out var background) || !TryReadColor(root, "foreground", out var foreground)) return;
            SetAppearance(theme.GetString() == "dark", background, foreground);
        }
        catch (JsonException) { /* Ignore messages that are not valid theme settings. */ }
        catch (InvalidOperationException) { /* Ignore JSON values with an unexpected type. */ }
    }

    private void SetAppearance(bool dark, Color background, Color foreground)
    {
        darkCaption = dark;
        captionBackground = background;
        captionForeground = foreground;
        BackColor = background;
        status.ForeColor = foreground;
        web.DefaultBackgroundColor = background;
        ApplyWindowTheme();
    }

    public StudioWindow()
    {
        Text = "Linux Studio — Εκκίνηση";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 850);
        MinimumSize = new Size(420, 540);
        BackColor = Color.FromArgb(13, 17, 25);
        try
        {
            var preference = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "linux-studio", "appearance");
            if (File.Exists(preference) && File.ReadAllText(preference).Trim() == "light")
                SetAppearance(false, Color.FromArgb(237, 244, 250), Color.FromArgb(20, 43, 64));
        }
        catch (IOException) { /* The web interface will retry loading the saved theme. */ }
        catch (UnauthorizedAccessException) { /* Keep the default theme until the web interface loads. */ }
        Icon = brandIcon;

        var startup = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3 };
        startup.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        startup.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        startup.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        var logo = new PictureBox
        {
            Image = brandImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Size = new Size(96, 96),
            Anchor = AnchorStyles.Bottom,
            Margin = new Padding(0, 0, 0, 12),
            AccessibleName = AppName,
            TabStop = false,
        };
        status.Anchor = AnchorStyles.None;
        status.Margin = new Padding(12, 0, 12, 14);
        browser.Anchor = AnchorStyles.Top;
        startup.Controls.Add(logo, 0, 0);
        startup.Controls.Add(status, 0, 1);
        startup.Controls.Add(browser, 0, 2);
        Controls.Add(startup);
        Controls.Add(web);
        browser.Click += (_, _) => OpenBrowser();
    }

    private static Icon LoadBrandIcon()
    {
        using var stream = typeof(StudioWindow).Assembly.GetManifestResourceStream("LinuxStudio.BrandIcon")
            ?? throw new InvalidOperationException("Λείπει το εικονίδιο του Linux Studio.");
        using var icon = new Icon(stream);
        return (Icon)icon.Clone();
    }

    private static Image LoadBrandImage()
    {
        using var stream = typeof(StudioWindow).Assembly.GetManifestResourceStream("LinuxStudio.BrandLogo")
            ?? throw new InvalidOperationException("Λείπει το λογότυπο του Linux Studio.");
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
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
            web.CoreWebView2.WebMessageReceived += ReceiveAppearance;
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
        if (disposing)
        {
            brandIcon.Dispose();
            brandImage.Dispose();
        }
    }
}
