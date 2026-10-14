export function sessionUri(id: string): string {
  return `ahp-session:/${id}`;
}

export function chatUri(id: string): string {
  return `ahp-chat:/${id}`;
}

export function sessionDOName(hostId: string, sessionId: string): string {
  return `${hostId}/${sessionId}`;
}
