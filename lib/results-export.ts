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
  if (/^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)) value = `'${value}`;
  if (value.includes(",") || value.includes("\n") || value.includes("\r") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function buildVotesCsv(rows: ExportVoteRow[]): string {
  const header = [
    "member_id",
    "full_name",
    "email",
    "ballot_version",
    "vote_payload_json",
    "cast_at"
  ];

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

export interface ResultChoice {
  id: string;
  label: string;
}
export function buildResultsCsv(
  rows: ExportVoteRow[],
  choices: ResultChoice[],
  manualCounts: Array<{ choiceId: string; count: number }>
): string {
  const recorded = new Map<string, number>();
  for (const row of rows) {
    const id = (row.votePayloadJson as { choiceId?: string })?.choiceId;
    if (id) recorded.set(id, (recorded.get(id) || 0) + 1);
  }
  const manual = new Map(manualCounts.map((item) => [item.choiceId, item.count]));
  return (
    "choice_id,choice_label,electronic_votes,manual_votes,total_votes\n" +
    choices
      .map((choice) => {
        const electronic = recorded.get(choice.id) || 0;
        const paper = manual.get(choice.id) || 0;
        return [
          choice.id,
          choice.label,
          String(electronic),
          String(paper),
          String(electronic + paper)
        ]
          .map(csvEscape)
          .join(",");
      })
      .join("\n") +
    "\n"
  );
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

export async function createZipBuffer(
  files: Array<{ path: string; content: Buffer }>
): Promise<Buffer> {
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

export function parseGcsPath(gcsPath: string): { bucket: string; objectName: string } {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsPath);
  if (!match) {
    throw new Error(`Invalid gcs path: ${gcsPath}`);
  }

  return {
    bucket: match[1],
    objectName: match[2]
  };
}

export async function createSignedExportDownloadUrl(
  gcsPath: string,
  expiresInMinutes = 15
): Promise<string> {
  const { bucket, objectName } = parseGcsPath(gcsPath);
  const storage = new Storage();
  const [url] = await storage
    .bucket(bucket)
    .file(objectName)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000
    });
  return url;
}

export async function createAndUploadResultsBundle(params: {
  electionId: string;
  electionName: string;
  rows: ExportVoteRow[];
  choices: ResultChoice[];
  manualCounts: Array<{ choiceId: string; count: number }>;
}): Promise<{ gcsPath: string; bundleSha256: string; manifest: Record<string, unknown> }> {
  const generatedAt = new Date().toISOString();
  const csvText = buildVotesCsv(params.rows);
  const csvBuffer = Buffer.from(csvText, "utf8");

  const resultsBuffer = Buffer.from(
    buildResultsCsv(params.rows, params.choices, params.manualCounts)
  );
  const manifest = buildManifest({
    electionId: params.electionId,
    electionName: params.electionName,
    generatedAt,
    voteCount: params.rows.length,
    files: [
      { path: "results.csv", sha256: sha256Hex(resultsBuffer), bytes: resultsBuffer.byteLength },
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
    { path: "results.csv", content: resultsBuffer },
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
