using System;
using System.IO;
using System.Runtime.InteropServices;

class Program {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    static void Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string electronExe = Path.Combine(baseDir, @"node_modules\electron\dist\electron.exe");
        string cmd = "\"" + electronExe + "\" \"" + baseDir + "\"";

        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = @"winsta0\default";

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();

        bool ok = CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, baseDir, ref si, out pi);
        if (!ok) {
            Console.WriteLine("Error: " + Marshal.GetLastWin32Error());
        } else {
            Console.WriteLine("Launched PID: " + pi.dwProcessId);
        }
    }
}
