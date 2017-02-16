export function parseBearer(authorizationHeaderValue) {
  if (!authorizationHeaderValue || typeof authorizationHeaderValue !== 'string') {
    return null;
  }

  const bearerRegex = /^Bearer (.+)$/;
  const matches = bearerRegex.exec(authorizationHeaderValue);
  // matches contains whole value and group, we are interested in group part
  if (!matches || matches.length < 2) {
    return null;
  }

  const token = matches[1];
  if (!token) {
    return null;
  }

  return token;
}
