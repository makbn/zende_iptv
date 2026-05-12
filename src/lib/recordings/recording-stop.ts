import "server-only";

import { prisma } from "@/lib/db/prisma";

import { requestStopFfmpegRecording } from "./ffmpeg-runner";
import { RecordingPrepError } from "./recording-prep";

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
  const stopped = await requestStopFfmpegRecording(recordingId);
  if (!stopped) {
    throw new RecordingPrepError(
      "Could not signal the encoder. Try refreshing — the recording may have just finished.",
      409,
    );
  }
}
