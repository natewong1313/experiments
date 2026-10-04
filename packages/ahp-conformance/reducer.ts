import type {
  AutomationEntry,
  AutomationRunState,
  AutomationState,
  ChatState,
  SessionState,
  StateAction,
} from "@experiments/protocol-schemas";

/**
 * Spec reducers for the deterministic AHP actions this suite can compare
 * against a fresh-subscribe snapshot.
 *
 * Each reducer covers the actions whose behavior is fully specified and
 * side-effect free: set-style session and chat actions, server-published
 * automation catalogue changes, and automation-run lifecycle changes.
 * Server-emitted conversational actions (turns, deltas, tool calls) are
 * observed, not reduced, so they are out of scope here.
 *
 * Every reducer accepts the full `StateAction` union and returns the state
 * unchanged for actions outside its channel or outside its deterministic
 * set, mirroring the reference reducers' default branch. Side-effect-only
 * requests (creation, update, cancel) also leave the state unchanged: the
 * authoritative result arrives through a later state action.
 */

function cloneState<T>(state: T): T {
  return structuredClone(state);
}

/** Reduce a session state through the deterministic session actions. */
function reduceSessionState(state: SessionState, action: StateAction): SessionState {
  const next = cloneState(state);

  switch (action.type) {
    case "session/titleChanged": {

      next.title = action.title;

      break;
    }

    case "session/workingDirectorySet": {

      const directories = next.workingDirectories ?? [];

      if (!directories.includes(action.directory)) {
        next.workingDirectories = [...directories, action.directory];
      }

      break;
    }

    case "session/workingDirectoryRemoved": {

      if (next.workingDirectories) {
        next.workingDirectories = next.workingDirectories.filter(
          (directory) => directory !== action.directory,
        );
      }

      break;
    }
  }

  return next;
}

/** Reduce a chat state through the deterministic chat actions. */
function reduceChatState(state: ChatState, action: StateAction): ChatState {
  const next = cloneState(state);

  switch (action.type) {
    case "chat/draftChanged": {

      next.draft = action.draft;

      break;
    }

    case "chat/activityChanged": {

      next.activity = action.activity;

      break;
    }
  }

  return next;
}

function upsertAutomationEntry(state: AutomationState, entry: AutomationEntry): AutomationState {
  const replaced = state.entries.some((item) => item.resource === entry.resource);

  const entries = replaced
    ? state.entries.map((item) => (item.resource === entry.resource ? entry : item))
    : [...state.entries, entry];

  return { ...state, entries };
}

/** Reduce an automation catalogue through the deterministic catalogue actions. */
function reduceAutomationState(state: AutomationState, action: StateAction): AutomationState {
  const next = cloneState(state);

  switch (action.type) {
    case "automation/set": {

      return upsertAutomationEntry(next, action.automation);
    }

    case "automation/removed": {

      return {
        ...next,
        entries: next.entries.filter((entry) => entry.resource !== action.resource),
      };
    }
  }

  return next;
}

/** Reduce an automation-run state through the deterministic run actions. */
function reduceAutomationRunState(
  state: AutomationRunState,
  action: StateAction,
): AutomationRunState {
  const next = cloneState(state);

  switch (action.type) {
    case "automationRun/lifecycleChanged": {

      next.lifecycle = action.lifecycle;

      break;
    }

    case "automationRun/sessionSet": {

      if (!next.sessions.includes(action.session)) {
        next.sessions = [...next.sessions, action.session];
      }

      break;
    }

    case "automationRun/sessionRemoved": {

      next.sessions = next.sessions.filter((session) => session !== action.session);

      if (next.primarySession === action.session) {
        delete next.primarySession;
      }

      break;
    }

    case "automationRun/primarySessionChanged": {

      if (action.primarySession) {
        next.primarySession = action.primarySession;
      } else {
        delete next.primarySession;
      }

      break;
    }
  }

  return next;
}

/**
 * Blank the fields a server may advance independently of the reduced actions
 * (the chat's modified timestamp), so a correct reducer is not flagged for a
 * benign timestamp change. Session states carry no top-level timestamps.
 */
function stripVolatile(state: ChatState): ChatState {
  const copy = cloneState(state);

  copy.modifiedAt = "";

  return copy;
}

export {
  reduceAutomationRunState,
  reduceAutomationState,
  reduceChatState,
  reduceSessionState,
  stripVolatile,
};
