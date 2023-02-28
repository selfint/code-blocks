import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";

const maxRedirects = 10;
function get(url: string | URL): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = https.get(url, resolve);
    request.on("error", reject);
  });
}

export async function download(
  srcUrl: vscode.Uri,
  destPath: string,
  progress?: (downloaded: number, contentLength: number) => void
): Promise<void> {
  let url = srcUrl.toString(true);
  for (let i = 0; i < maxRedirects; ++i) {
    const response = await get(url);

    if (response.statusCode === undefined) {
      throw new Error("Request failed");
    } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      url = response.headers.location;
    } else {
      return new Promise<void>((resolve, reject) => {
        if (response.statusCode === undefined) {
          throw new Error("Request failed");
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP status ${response.statusCode} : ${response.statusMessage ?? "no message"}`));
        }
        if (response.headers["content-type"] !== "application/octet-stream") {
          reject(new Error("HTTP response does not contain an octet stream"));
        } else {
          const stm = fs.createWriteStream(destPath, { mode: 0o600 });
          const pipeStm = response.pipe(stm);
          if (progress) {
            const contentLength = response.headers["content-length"]
              ? Number.parseInt(response.headers["content-length"])
              : null;

            if (contentLength !== null) {
              let downloaded = 0;
              response.on("data", (chunk) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                downloaded += chunk.length;
                progress(downloaded, contentLength);
              });
            }
          }
          pipeStm.on("finish", resolve);
          pipeStm.on("error", reject);
          response.on("error", reject);
        }
      });
    }
  }
}
