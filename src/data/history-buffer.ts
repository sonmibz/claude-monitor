export class HistoryBuffer {
  private buffer: number[];
  private capacity: number;

  constructor(capacity: number = 30) {
    this.capacity = capacity;
    this.buffer = [];
  }

  push(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getAll(): number[] {
    return [...this.buffer];
  }

  peak(): number {
    if (this.buffer.length === 0) return 0;
    return Math.max(...this.buffer);
  }

  latest(): number {
    if (this.buffer.length === 0) return 0;
    return this.buffer[this.buffer.length - 1];
  }

  size(): number {
    return this.buffer.length;
  }
}
