const CLAUDE_DRIVER = "claudeAgent";
const OPENAI_DRIVER = "codex";

/**
 * Model pickers list Claude providers before OpenAI ones. Only that pair
 * moves: when the first Claude entry comes after the first OpenAI entry,
 * every Claude entry moves up to sit just before it. All other providers
 * keep the server's order.
 */
export function orderClaudeBeforeOpenAi<T>(
  items: ReadonlyArray<T>,
  driverOf: (item: T) => string,
): ReadonlyArray<T> {
  const firstOpenAi = items.findIndex((item) => driverOf(item) === OPENAI_DRIVER);
  const firstClaude = items.findIndex((item) => driverOf(item) === CLAUDE_DRIVER);
  if (firstOpenAi === -1 || firstClaude === -1 || firstClaude < firstOpenAi) return items;
  const claude = items.filter((item) => driverOf(item) === CLAUDE_DRIVER);
  const rest = items.filter((item) => driverOf(item) !== CLAUDE_DRIVER);
  return [...rest.slice(0, firstOpenAi), ...claude, ...rest.slice(firstOpenAi)];
}
