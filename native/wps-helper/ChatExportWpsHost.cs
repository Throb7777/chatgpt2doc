using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class ChatExportWpsHost
{
    private const int ProtocolVersion = 1;
    private const int MaxMessageBytes = 24 * 1024 * 1024;
    private const int MaxDocxBytes = 16 * 1024 * 1024;
    private const int MaxHtmlBytes = 8 * 1024 * 1024;
    private const int MaxTextCharacters = 1024 * 1024;
    private const string WpsFormat = "Kingsoft WPS 9.0 Format";

    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
    {
        MaxJsonLength = MaxMessageBytes
    };

    [STAThread]
    private static int Main()
    {
        Stream input = Console.OpenStandardInput();
        Stream output = Console.OpenStandardOutput();
        try
        {
            while (true)
            {
                string message = ReadMessage(input);
                if (message == null) return 0;
                WriteMessage(output, Handle(message));
            }
        }
        catch (Exception error)
        {
            try { WriteMessage(output, Error("host-failure", error.Message)); } catch { }
            return 1;
        }
    }

    private static string Handle(string json)
    {
        Dictionary<string, object> request;
        try
        {
            request = Json.Deserialize<Dictionary<string, object>>(json);
        }
        catch (Exception error)
        {
            return Error("invalid-json", error.Message);
        }

        object operationValue;
        string operation = request.TryGetValue("operation", out operationValue)
            ? operationValue as string
            : null;
        if (operation == "ping")
        {
            return Success(null);
        }
        if (operation == "diagnose")
        {
            return Success(BuildDiagnostics());
        }
        if (operation != "prepare-wps-clipboard")
        {
            return Error("unsupported-operation", "The requested operation is not supported.");
        }

        try
        {
            string docxBase64 = RequiredString(request, "docxBase64");
            string html = RequiredString(request, "html");
            string text = RequiredString(request, "text");
            byte[] docx = Convert.FromBase64String(docxBase64);
            if (docx.Length == 0 || docx.Length > MaxDocxBytes)
                throw new InvalidDataException("The DOCX payload is outside the allowed size.");
            if (Encoding.UTF8.GetByteCount(html) > MaxHtmlBytes)
                throw new InvalidDataException("The HTML payload is outside the allowed size.");
            if (text.Length > MaxTextCharacters)
                throw new InvalidDataException("The text payload is outside the allowed size.");

            int equationCount = ValidateDocx(docx);
            DataObject clipboard = new DataObject();
            clipboard.SetData(WpsFormat, false, new MemoryStream(docx, false));
            clipboard.SetData(DataFormats.Html, BuildCfHtml(html));
            clipboard.SetData(DataFormats.UnicodeText, text);
            clipboard.SetData(DataFormats.Text, text);
            Clipboard.SetDataObject(clipboard, true, 5, 100);
            return Json.Serialize(new
            {
                ok = true,
                protocolVersion = ProtocolVersion,
                equationCount = equationCount,
                packageBytes = docx.Length
            });
        }
        catch (Exception error)
        {
            return Error("invalid-payload", error.Message);
        }
    }

    private static string Success(object diagnostics)
    {
        if (diagnostics == null)
        {
            return Json.Serialize(new
            {
                ok = true,
                protocolVersion = ProtocolVersion,
                helperVersion = "0.1.0",
                wpsInstalled = Type.GetTypeFromProgID("KWPS.Application") != null
            });
        }
        return Json.Serialize(new
        {
            ok = true,
            protocolVersion = ProtocolVersion,
            helperVersion = "0.1.0",
            wpsInstalled = Type.GetTypeFromProgID("KWPS.Application") != null,
            diagnostics = diagnostics
        });
    }

    private static object BuildDiagnostics()
    {
        string executablePath = Application.ExecutablePath;
        string installPath = Path.GetDirectoryName(executablePath) ?? "";
        string manifestPath = Path.Combine(installPath, "com.chat_export_local.wps.json");
        string[] allowedOrigins = ReadAllowedOrigins(manifestPath);
        return new
        {
            executablePath = executablePath,
            installPath = installPath,
            manifestPath = manifestPath,
            allowedOrigins = allowedOrigins,
            allowedExtensionIds = ExtractExtensionIds(allowedOrigins)
        };
    }

    private static string[] ReadAllowedOrigins(string manifestPath)
    {
        if (!File.Exists(manifestPath)) return new string[0];
        try
        {
            Dictionary<string, object> manifest = Json.Deserialize<Dictionary<string, object>>(
                File.ReadAllText(manifestPath, Encoding.UTF8));
            object originsValue;
            if (!manifest.TryGetValue("allowed_origins", out originsValue)) return new string[0];
            ArrayList origins = originsValue as ArrayList;
            if (origins == null) return new string[0];
            List<string> result = new List<string>();
            foreach (object origin in origins)
            {
                string text = origin as string;
                if (!String.IsNullOrEmpty(text)) result.Add(text);
            }
            return result.ToArray();
        }
        catch
        {
            return new string[0];
        }
    }

    private static string[] ExtractExtensionIds(string[] origins)
    {
        const string prefix = "chrome-extension://";
        List<string> result = new List<string>();
        foreach (string origin in origins)
        {
            if (!origin.StartsWith(prefix, StringComparison.Ordinal)) continue;
            string id = origin.Substring(prefix.Length).TrimEnd('/');
            if (id.Length == 32) result.Add(id);
        }
        return result.ToArray();
    }

    private static int ValidateDocx(byte[] bytes)
    {
        using (MemoryStream stream = new MemoryStream(bytes, false))
        using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read, false))
        {
            if (archive.GetEntry("[Content_Types].xml") == null)
                throw new InvalidDataException("The package has no content-types part.");
            ZipArchiveEntry document = archive.GetEntry("word/document.xml");
            if (document == null)
                throw new InvalidDataException("The package has no Word document part.");
            using (StreamReader reader = new StreamReader(document.Open(), Encoding.UTF8, true))
            {
                string xml = reader.ReadToEnd();
                if (xml.IndexOf("<w:document", StringComparison.Ordinal) < 0)
                    throw new InvalidDataException("The Word document root is invalid.");
                return Count(xml, "<m:oMath");
            }
        }
    }

    private static int Count(string value, string token)
    {
        int count = 0;
        int offset = 0;
        while ((offset = value.IndexOf(token, offset, StringComparison.Ordinal)) >= 0)
        {
            count++;
            offset += token.Length;
        }
        return count;
    }

    private static string RequiredString(Dictionary<string, object> request, string key)
    {
        object value;
        string text = request.TryGetValue(key, out value) ? value as string : null;
        if (text == null) throw new InvalidDataException("Missing field: " + key);
        return text;
    }

    private static string BuildCfHtml(string html)
    {
        if (html.StartsWith("Version:", StringComparison.Ordinal)) return html;
        const string startMarker = "<!--StartFragment-->";
        const string endMarker = "<!--EndFragment-->";
        string body = html.IndexOf(startMarker, StringComparison.Ordinal) >= 0
            ? html
            : "<html><body>" + startMarker + html + endMarker + "</body></html>";
        const string headerTemplate =
            "Version:1.0\r\nStartHTML:{0:0000000000}\r\nEndHTML:{1:0000000000}\r\n" +
            "StartFragment:{2:0000000000}\r\nEndFragment:{3:0000000000}\r\n";
        string placeholder = string.Format(headerTemplate, 0, 0, 0, 0);
        int startHtml = Encoding.UTF8.GetByteCount(placeholder);
        int startFragment = startHtml + Encoding.UTF8.GetByteCount(
            body.Substring(0, body.IndexOf(startMarker, StringComparison.Ordinal) + startMarker.Length));
        int endFragment = startHtml + Encoding.UTF8.GetByteCount(
            body.Substring(0, body.IndexOf(endMarker, StringComparison.Ordinal)));
        int endHtml = startHtml + Encoding.UTF8.GetByteCount(body);
        return string.Format(headerTemplate, startHtml, endHtml, startFragment, endFragment) + body;
    }

    private static string ReadMessage(Stream input)
    {
        byte[] lengthBytes = ReadExact(input, 4, true);
        if (lengthBytes == null) return null;
        int length = BitConverter.ToInt32(lengthBytes, 0);
        if (length <= 0 || length > MaxMessageBytes)
            throw new InvalidDataException("Native message length is invalid.");
        return Encoding.UTF8.GetString(ReadExact(input, length, false));
    }

    private static byte[] ReadExact(Stream input, int length, bool allowEof)
    {
        byte[] bytes = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int read = input.Read(bytes, offset, length - offset);
            if (read == 0)
            {
                if (allowEof && offset == 0) return null;
                throw new EndOfStreamException();
            }
            offset += read;
        }
        return bytes;
    }

    private static void WriteMessage(Stream output, string json)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        byte[] length = BitConverter.GetBytes(bytes.Length);
        output.Write(length, 0, length.Length);
        output.Write(bytes, 0, bytes.Length);
        output.Flush();
    }

    private static string Error(string code, string message)
    {
        return Json.Serialize(new { ok = false, error = code, message = message });
    }
}
