using System.ServiceProcess;

internal sealed class ServiceFixture : ServiceBase
{
    private ServiceFixture(string name)
    {
        ServiceName = name;
        CanStop = true;
        AutoLog = false;
    }

    private static void Main(string[] args)
    {
        ServiceBase.Run(new ServiceFixture(args[0]));
    }
}
