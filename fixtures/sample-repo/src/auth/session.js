// Session token management for authenticated users.
export function createSession(username) {
  return { id: `${username}-session`, createdAt: 0 };
}

export function createToken(session) {
  return `token-${session.id}`;
}

export function verifyToken(token, session) {
  return token === `token-${session.id}`;
}

export function refreshSession(session) {
  return { ...session, createdAt: session.createdAt + 1 };
}
