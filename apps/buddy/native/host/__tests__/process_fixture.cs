using System;
using System.Threading;
using System.Windows.Forms;

internal static class ProcessFixture
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args[0] == "headless")
        {
            Console.WriteLine("ready");
            Thread.Sleep(Timeout.Infinite);
            return;
        }
        using (var form = new Form { Text = "Process contract fixture" })
        {
            form.Shown += (sender, eventArgs) => Console.WriteLine("ready");
            if (args[0] == "ignore-close")
                form.FormClosing += (sender, eventArgs) => eventArgs.Cancel = true;
            Application.Run(form);
        }
    }
}
