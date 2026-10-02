/** Owns pending permission requests as well as live tracks. */
export class CameraController {
  private generation = 0;
  private stream: MediaStream | null = null;
  async open(getMedia: () => Promise<MediaStream>) {
    this.stop();
    const generation = this.generation;
    const stream = await getMedia();
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    this.stream = stream;
    return stream;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
