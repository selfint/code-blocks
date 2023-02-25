import * as vscode from "vscode";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";

const maxRedirects = 10;
function get(url: string | URL): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    let request = https.get(url, resolve);
    request.on("error", reject);
  });
}

export async function download(
  srcUrl: vscode.Uri,
  destPath: string,
  progress?: (downloaded: number, contentLength: number) => void
) {
  let url = srcUrl.toString(true);
  for (let i = 0; i < maxRedirects; ++i) {
    let response = await get(url);
    if (response.statusCode! >= 300 && response.statusCode! < 400 && response.headers.location) {
      url = response.headers.location;
    } else {
      return new Promise(async (resolve, reject) => {
        if (response.statusCode! < 200 || response.statusCode! >= 300) {
          reject(new Error(`HTTP status ${response.statusCode} : ${response.statusMessage}`));
        }
        if (response.headers["content-type"] !== "application/octet-stream") {
          reject(new Error("HTTP response does not contain an octet stream"));
        } else {
          let stm = fs.createWriteStream(destPath, { mode: 0o600 });
          let pipeStm = response.pipe(stm);
          if (progress) {
            let contentLength = response.headers["content-length"]
              ? Number.parseInt(response.headers["content-length"])
              : null;
            let downloaded = 0;
            response.on("data", (chunk) => {
              downloaded += chunk.length;
              progress(downloaded, contentLength!);
            });
          }
          pipeStm.on("finish", resolve);
          pipeStm.on("error", reject);
          response.on("error", reject);
        }
      });
    }
  }
}
