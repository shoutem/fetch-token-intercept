export function formatBearer(token) {
  if (!token) {
    return null;
  }

  return `Bearer ${token}`;
}

export function parseBearer(authorizationHeaderValue) {
  if (!authorizationHeaderValue) {
    return null;
  }

  const parts = authorizationHeaderValue.split(' ');
  if(parts.length !== 2) {
    return null;
  }

  const token = parts[1];
  if (token === 'undefined') {
    return null;
  }

  return token;
}
