using System.Diagnostics;

namespace ISOStudio.Linux;

internal static class Program
{
    private static int Main(string[] args)
    {
        var app = Path.Combine(AppContext.BaseDirectory, "app");
        var startInfo = new ProcessStartInfo
        {
            FileName = "node",
            WorkingDirectory = app,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add(Path.Combine(app, "Linux", "launch.mjs"));
        foreach (var arg in args) startInfo.ArgumentList.Add(arg);
        startInfo.Environment.Remove("NODE_OPTIONS");
        startInfo.Environment["LINUX_STUDIO_PARENT_PID"] = Environment.ProcessId.ToString();
        try
        {
            using var launcher = Process.Start(startInfo);
            if (launcher is null) return 1;
            Console.CancelKeyPress += (_, eventArgs) => eventArgs.Cancel = true;
            launcher.WaitForExit();
            return launcher.ExitCode;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            Console.Error.WriteLine("Απαιτείται Node.js 22 ή νεότερο στο PATH.");
            return 1;
        }
    }
}
