import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** Trả thẳng body gốc, không bọc `{ success, data }` — dùng cho tải file / stream. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
