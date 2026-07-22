import { log } from './logger';

interface WinappToolResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type WinappTool = (options?: { toolArgs?: Array<string> }) => Promise<WinappToolResult>;

const MISSING_DEPENDENCY_MESSAGE =
  'MSIX packaging requires the optional dependency "@microsoft/winappcli", which only installs on Windows. ' +
  'Reinstall dependencies on a Windows machine so the Windows SDK build tools can be acquired automatically.';

let cachedTool: WinappTool | undefined;

const loadWinappTool = async (): Promise<WinappTool> => {
  if (cachedTool) {
    return cachedTool;
  }

  try {
    const winappcli = (await import('@microsoft/winappcli')) as unknown as {
      tool?: WinappTool;
      default?: { tool?: WinappTool };
    };
    cachedTool = winappcli.tool ?? winappcli.default?.tool;
  } catch (error) {
    log.debug(
      'Failed to load @microsoft/winappcli',
      error instanceof Error ? error.message : error,
    );
  }

  if (!cachedTool) {
    // log.error with throwError=true throws; the explicit throw keeps control-flow analysis happy.
    log.error(MISSING_DEPENDENCY_MESSAGE, true);
    throw new Error(MISSING_DEPENDENCY_MESSAGE);
  }

  return cachedTool;
};

/**
 * Runs a Windows SDK tool (e.g. `makeappx`, `makepri`) through `@microsoft/winappcli`.
 * winappcli self-acquires the SDK build tools via NuGet, so a locally installed Windows
 * SDK is no longer required. Resolves with the tool's stdout and rejects when the
 * underlying tool exits with a non-zero code.
 */
export const runWinappTool = async (toolArgs: Array<string>): Promise<string> => {
  const tool = await loadWinappTool();
  log.debug('Calling winappcli tool with args', toolArgs);
  const result = await tool({ toolArgs });
  log.debug('winappcli tool stdout', result.stdout);
  return result.stdout;
};
