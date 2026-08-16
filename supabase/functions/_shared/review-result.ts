import { HttpError } from './http.ts';

const REVIEW_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 100 },
    detail: { type: 'string', minLength: 1, maxLength: 500 },
    evidence_refs: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
  },
  required: ['title', 'detail', 'evidence_refs'],
};

export const AI_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'string', enum: ['1.0'] },
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    highlights: { type: 'array', maxItems: 5, items: REVIEW_ITEM_SCHEMA },
    blockers: { type: 'array', maxItems: 5, items: REVIEW_ITEM_SCHEMA },
    recommendations: { type: 'array', maxItems: 5, items: REVIEW_ITEM_SCHEMA },
    limitations: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
  },
  required: ['schema_version', 'summary', 'highlights', 'blockers', 'recommendations', 'limitations'],
};

type ReviewItem = { title: string; detail: string; evidence_refs: string[] };
export type AIReviewResult = {
  schema_version: '1.0';
  summary: string;
  highlights: ReviewItem[];
  blockers: ReviewItem[];
  recommendations: ReviewItem[];
  limitations: string[];
};

function normalizeText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function normalizeItems(value: unknown, validEvidenceRefs: Set<string>): ReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map(item => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const title = normalizeText(record.title, 100);
    const detail = normalizeText(record.detail, 500);
    const evidenceRefs = Array.isArray(record.evidence_refs)
      ? [...new Set(record.evidence_refs
        .filter((ref): ref is string => typeof ref === 'string' && validEvidenceRefs.has(ref)))]
        .slice(0, 5)
      : [];
    return title && detail ? { title, detail, evidence_refs: evidenceRefs } : null;
  }).filter((item): item is ReviewItem => Boolean(item));
}

export function validateReviewResult(value: unknown, validEvidenceRefs: Set<string>): AIReviewResult {
  if (!value || typeof value !== 'object') {
    throw new HttpError(502, 'invalid_model_output', '模型没有返回有效的分析结果');
  }
  const record = value as Record<string, unknown>;
  const summary = normalizeText(record.summary, 600);
  if (record.schema_version !== '1.0' || !summary) {
    throw new HttpError(502, 'invalid_model_output', '模型返回的分析格式不完整');
  }
  const limitations = Array.isArray(record.limitations)
    ? record.limitations.map(value => normalizeText(value, 300)).filter(Boolean).slice(0, 5)
    : [];
  return {
    schema_version: '1.0',
    summary,
    highlights: normalizeItems(record.highlights, validEvidenceRefs),
    blockers: normalizeItems(record.blockers, validEvidenceRefs),
    recommendations: normalizeItems(record.recommendations, validEvidenceRefs),
    limitations,
  };
}
