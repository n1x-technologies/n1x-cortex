// toolkit/src/commands/pause.ts
import { loadState, saveState, setPaused } from '../hooks/state.js';

export function runPause(vaultDir: string): void {
  saveState(vaultDir, setPaused(loadState(vaultDir), true));
}
export function runResume(vaultDir: string): void {
  saveState(vaultDir, setPaused(loadState(vaultDir), false));
}
