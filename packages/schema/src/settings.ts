import { z } from 'zod';

export const Shortcut = z.string().min(1);

export const AppSettings = z.object({
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  libraryDir: z.string().optional(),
  recording: z
    .object({
      fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(60),
      countdownSec: z.number().int().min(0).max(10).default(3),
      captureSystemAudio: z.boolean().default(true),
      captureMicrophone: z.boolean().default(true),
      captureWebcam: z.boolean().default(false),
      hideCursorInVideo: z.boolean().default(true),
      trackInteractions: z.boolean().default(true),
      /** Record keyboard shortcuts (modifier combos only — never plain typing). */
      trackShortcuts: z.boolean().default(false),
      microphoneDeviceId: z.string().nullable().default(null),
      webcamDeviceId: z.string().nullable().default(null),
      excludedBundleIds: z.array(z.string()).default([]),
    })
    .default({}),
  shortcuts: z
    .object({
      startStopRecording: Shortcut.default('CommandOrControl+Shift+2'),
      pauseResumeRecording: Shortcut.default('CommandOrControl+Shift+P'),
    })
    .default({}),
  transcription: z
    .object({
      whisperBinaryPath: z.string().nullable().default(null),
      whisperModelPath: z.string().nullable().default(null),
      language: z.string().default('auto'),
    })
    .default({}),
  ffmpegPath: z.string().nullable().default(null),
  autosaveIntervalSec: z.number().int().min(5).max(600).default(15),
});
export type AppSettings = z.infer<typeof AppSettings>;
