using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace Unshackle.FfmpegHelper
{
    internal static class Program
    {
        private const string NodePath = "__UNSHACKLE_NODE_PATH__";
        private const string ScriptPath = "__UNSHACKLE_SCRIPT_PATH__";

        private static int Main(string[] args)
        {
            if (!File.Exists(NodePath))
            {
                Console.Error.WriteLine("Node.js executable was not found: " + NodePath);
                return 1;
            }

            if (!File.Exists(ScriptPath))
            {
                Console.Error.WriteLine("Native helper entrypoint was not found: " + ScriptPath);
                return 1;
            }

            using (Process child = StartNode(args))
            {
                Thread stdinThread = StartCopyThread(
                    Console.OpenStandardInput(),
                    child.StandardInput.BaseStream,
                    closeOutput: true
                );
                Thread stdoutThread = StartCopyThread(
                    child.StandardOutput.BaseStream,
                    Console.OpenStandardOutput(),
                    closeOutput: false
                );
                Thread stderrThread = StartCopyThread(
                    child.StandardError.BaseStream,
                    Console.OpenStandardError(),
                    closeOutput: false
                );

                stdoutThread.Join();
                child.WaitForExit();
                stdinThread.Join(500);
                stderrThread.Join(500);
                return child.ExitCode;
            }
        }

        private static Process StartNode(string[] args)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = NodePath,
                Arguments = BuildArguments(args),
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            Process child = Process.Start(startInfo);
            if (child == null)
            {
                throw new InvalidOperationException("Could not start Node.js native helper process.");
            }

            return child;
        }

        private static string BuildArguments(string[] args)
        {
            string result = Quote(ScriptPath);
            foreach (string arg in args)
            {
                result += " " + Quote(arg);
            }

            return result;
        }

        private static Thread StartCopyThread(Stream input, Stream output, bool closeOutput)
        {
            Thread thread = new Thread(delegate()
            {
                try
                {
                    ReadAndFlush(input, output);
                }
                catch (IOException)
                {
                }
                catch (ObjectDisposedException)
                {
                }
                finally
                {
                    if (closeOutput)
                    {
                        try
                        {
                            output.Close();
                        }
                        catch (IOException)
                        {
                        }
                        catch (ObjectDisposedException)
                        {
                        }
                    }
                }
            });
            thread.IsBackground = true;
            thread.Start();
            return thread;
        }

        private static void ReadAndFlush(Stream input, Stream output)
        {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.Read(buffer, 0, buffer.Length)) > 0)
            {
                output.Write(buffer, 0, bytesRead);
                output.Flush();
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }
    }
}
