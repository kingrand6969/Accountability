export type BodyMeasurement = {
  readonly id: string;
  readonly recordedAt: string;
  readonly weightKg: number;
  readonly heightCm: number;
};

export type ProgressPhoto = {
  readonly id: string;
  readonly storagePath: string;
  readonly capturedAt: string;
  readonly weightKg: number | null;
};

export type AddMeasurementInput = {
  readonly recordedAt: string;
  readonly weightKg: number;
  readonly heightCm: number;
};

export type SaveProgressPhotoInput = {
  readonly localUri: string;
  readonly capturedAt: string;
  readonly weightKg: number | null;
};
