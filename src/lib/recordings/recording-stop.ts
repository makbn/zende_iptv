import "server-only";

import { prisma } from "@/lib/db/prisma";

import { requestStopFfmpegRecording } from "./ffmpeg-runner";
import { RECORDING_ENCODER_GONE_CODE } from "./recording-api-codes";
import { RecordingPrepError } from "./recording-prep";
import { resolveStoredRecordingFile } from "./recordings-dir";

export async function stopRecordingForOwner(
  ownerUserId: string,
  recordingId: string,
): Promise<void> {
  const row = await prisma.recording.findFirst({
    where: { id: recordingId, ownerUserId },
  });
  if (!row) {
    throw new RecordingPrepError("Recording not found.", 404);
  }
  if (row.status !== "RECORDING") {
    throw new RecordingPrepError("This recording is not in progress.", 409);
  }
  const absOutput = resolveStoredRecordingFile(ownerUserId, row.relativePath);
  const stopped = await requestStopFfmpegRecording(recordingId, absOutput);
  if (!stopped) {
    throw new RecordingPrepError(
      "Could not signal the encoder. If this recording started before the latest update, or the server restarted while it was running, the capture process may already be gone — refresh to see the current status.",
      409,
      RECORDING_ENCODER_GONE_CODE,
    );
  }
}
