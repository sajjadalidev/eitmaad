// Retries a read once after a short pause. Use only for reads that are safe to repeat.
// A fresh serverless connection to the database pooler can fail its first query.

export async function readWithRetry<T>(read: () => Promise<T>, pauseMs = 300): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.warn("Read failed, retrying once:", error instanceof Error ? error.message.split("\n")[0] : "unknown error");
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return read();
  }
}
