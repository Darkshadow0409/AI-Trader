import type { MouseEvent } from "react";
import {
  buildWorkspaceHref,
  parseWorkspaceRoute,
  resolveWorkspaceTarget,
  workspaceStateEquals,
  type WorkspaceRouteState,
  type WorkspaceTarget,
} from "../lib/workspaceNavigation";

export interface WorkspaceJumpAction {
  key: string;
  label: string;
  target: WorkspaceTarget;
  disabled?: boolean;
}

interface WorkspaceJumpRowProps {
  actions: WorkspaceJumpAction[];
  baseState?: Partial<WorkspaceRouteState>;
  className?: string;
  disableCurrentTarget?: boolean;
  onNavigate?: (target: WorkspaceTarget) => void;
}

function shouldHandleInAppNavigation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function WorkspaceJumpRow({
  actions,
  baseState,
  className,
  disableCurrentTarget = false,
  onNavigate,
}: WorkspaceJumpRowProps) {
  const liveBaseState = baseState ?? (typeof window !== "undefined" ? parseWorkspaceRoute(window.location.search) : undefined);

  return (
    <div className={className ? `workspace-jump-row workspace-jump-system ${className}` : "workspace-jump-row workspace-jump-system"}>
      {actions.map((action) => {
        const resolvedTarget = resolveWorkspaceTarget(action.target, liveBaseState);
        const href = buildWorkspaceHref(action.target, { baseState: liveBaseState });
        const isCurrent = disableCurrentTarget && workspaceStateEquals(resolvedTarget, resolveWorkspaceTarget({}, liveBaseState));
        const disabled = action.disabled || isCurrent;

        return (
          <a
            aria-current={isCurrent ? "page" : undefined}
            aria-disabled={disabled ? true : undefined}
            className={disabled ? "text-button workspace-inline-link workspace-link-current" : "text-button workspace-inline-link"}
            href={href}
            key={action.key}
            onClick={(event) => {
              if (disabled) {
                event.preventDefault();
                return;
              }
              if (!shouldHandleInAppNavigation(event)) {
                return;
              }
              event.preventDefault();
              onNavigate?.(action.target);
            }}
          >
            {action.label}
          </a>
        );
      })}
    </div>
  );
}
