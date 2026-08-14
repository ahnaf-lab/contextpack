// A small logging utility, unrelated to authentication.
export function log(level, message) {
  const line = `[${level}] ${message}`;
  console.log(line);
  return line;
}

export function warn(message) {
  return log('warn', message);
}
