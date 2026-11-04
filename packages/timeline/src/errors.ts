export class TimelineError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'locked' | 'overlap' | 'invalid' | 'incompatible',
  ) {
    super(message);
    this.name = 'TimelineError';
  }
}
