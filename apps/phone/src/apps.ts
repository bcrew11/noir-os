import { APP_CATALOG, type AppDefinition, type NoirState } from '@noir/core';

export function allApps(state: NoirState | null | undefined): AppDefinition[] {
  return [...APP_CATALOG, ...(state?.customApps ?? [])];
}
