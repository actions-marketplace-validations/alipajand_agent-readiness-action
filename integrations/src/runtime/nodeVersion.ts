const MIN_NODE = [22, 12] as const;

/** The engines need Node.js 22.12 or later; say so instead of failing obscurely. */
export function unsupportedNode(version: string = process.versions.node): string | undefined {
  const [major, minor] = version.split('.').map(Number);
  if (major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1])) return undefined;
  return `agent-readiness needs Node.js ${MIN_NODE.join('.')} or later; this is Node.js ${version}.`;
}
