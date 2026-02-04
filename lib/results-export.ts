import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { ZipFile } from "yazl";

export interface ExportVoteRow {
  memberId: string;
  fullName: string;
  email: string;
  ballotVersion: string;
  votePayloadJson: unknown;
  castAt: Date;
}

interface ManifestFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

interface BuildManifestParams {
  electionId: string;
  electionName: string;
  generatedAt: string;
  voteCount: number;
  files: ManifestFileEntry[];
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\r") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function buildVotesCsv(rows: ExportVoteRow[]): string {
  const header = ["member_id", "full_name", "email", "ballot_version", "vote_payload_json", "cast_at"];

  const lines = rows.map((row) => {
    const values = [
      row.memberId,
      row.fullName,
      row.email,
      row.ballotVersion,
      JSON.stringify(row.votePayloadJson),
      row.castAt.toISOString()
    ];
    return values.map((value) => csvEscape(value)).join(",");
  });

  return `${header.join(",")}\n${lines.join("\n")}\n`;
}

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildManifest(params: BuildManifestParams): Record<string, unknown> {
  return {
    version: 1,
    election_id: params.electionId,
    election_name: params.electionName,
    generated_at: params.generatedAt,
    vote_count: params.voteCount,
    files: params.files
  };
}

export async function createZipBuffer(files: Array<{ path: string; content: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const chunks: Buffer[] = [];

    zip.outputStream
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);

    for (const file of files) {
      zip.addBuffer(file.content, file.path);
    }

    zip.end();
  });
}

export async function uploadExportBundle(bundle: Buffer, objectName: string): Promise<string> {
  const bucketName = process.env.GCS_EXPORT_BUCKET;
  if (!bucketName) {
    throw new Error("GCS_EXPORT_BUCKET is required");
  }

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(bundle, {
    resumable: false,
    contentType: "application/zip",
    metadata: {
      cacheControl: "no-store"
    }
  });

  return `gs://${bucketName}/${objectName}`;
}

export async function createAndUploadResultsBundle(params: {
  electionId: string;
  electionName: string;
  rows: ExportVoteRow[];
}): Promise<{ gcsPath: string; bundleSha256: string; manifest: Record<string, unknown> }> {
  const generatedAt = new Date().toISOString();
  const csvText = buildVotesCsv(params.rows);
  const csvBuffer = Buffer.from(csvText, "utf8");

  const manifest = buildManifest({
    electionId: params.electionId,
    electionName: params.electionName,
    generatedAt,
    voteCount: params.rows.length,
    files: [
      {
        path: "votes.csv",
        sha256: sha256Hex(csvBuffer),
        bytes: csvBuffer.byteLength
      }
    ]
  });

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const zipBuffer = await createZipBuffer([
    { path: "votes.csv", content: csvBuffer },
    { path: "manifest.json", content: manifestBuffer }
  ]);

  const bundleSha256 = sha256Hex(zipBuffer);
  const objectName = `exports/${params.electionId}/${generatedAt.replaceAll(":", "-")}-results.zip`;
  const gcsPath = await uploadExportBundle(zipBuffer, objectName);

  return {
    gcsPath,
    bundleSha256,
    manifest
  };
}
