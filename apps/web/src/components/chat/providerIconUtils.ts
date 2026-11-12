import type { ProviderDriverKind } from "@t3tools/contracts";
import { resolveModelShortName } from "@t3tools/client-runtime/provider-clients";

const MUSE_SPARK_MODEL_PREFIX = "opencode/muse-spark-";
const CURSOR_GROK_MODEL_PREFIX = "grok-";
const CURSOR_GEMINI_MODEL_PREFIX = "gemini-";

export function usesMetaModelIcon(
  driverKind: ProviderDriverKind,
  model: string | undefined,
): boolean {
  return driverKind === "opencode" && model?.startsWith(MUSE_SPARK_MODEL_PREFIX) === true;
}

export function usesGrokModelIcon(
  driverKind: ProviderDriverKind,
  model: string | undefined,
): boolean {
  return driverKind === "cursor" && model?.startsWith(CURSOR_GROK_MODEL_PREFIX) === true;
}

export function usesGeminiModelIcon(
  driverKind: ProviderDriverKind,
  model: string | undefined,
): boolean {
  return driverKind === "cursor" && model?.startsWith(CURSOR_GEMINI_MODEL_PREFIX) === true;
}

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  aliases?: ReadonlyArray<string> | undefined;
  isDefault?: boolean | undefined;
  badge?: "new" | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(
  model: ModelEsque,
  driverKind: ProviderDriverKind | null | undefined,
): string {
  const shortName = resolveModelShortName(model, driverKind);
  return getDisplayModelName({ ...model, shortName }, { preferShortName: true });
}
