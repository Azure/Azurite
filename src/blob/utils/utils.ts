import { createWriteStream, PathLike } from "fs";

export function newEtag(): string {
  // TODO: Implement ETag
  return `"${new Date().getTime()}"`;
}

export async function streamToLocalFile(
  stream: NodeJS.ReadableStream,
  path: PathLike
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(path);
    stream
      .on("error", reject)
      // .on("end", resolve)
      .pipe(writeStream)
      .on("close", resolve)
      .on("error", reject);
  });
}
