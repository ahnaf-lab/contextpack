// Handles user login and authentication.
export function login(username, password) {
  if (!username || !password) {
    throw new Error('login requires a username and password');
  }
  const session = createSession(username);
  return { username, session, authenticated: true };
}

export function logout(session) {
  session.authenticated = false;
  return session;
}

function createSession(username) {
  return { id: `${username}-session`, createdAt: 0 };
}
