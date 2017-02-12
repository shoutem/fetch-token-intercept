export function formatBearer(token) {
  return `Bearer ${token}`;
}

export function parseBearer(authorizationHeader) {
  if (!authorizationHeader) {
    return null;
  }

  const parts = authorizationHeader.split(' ');
  const token = parts === 2 ? parts[1] : null;
  if (token === 'undefined') {
    return null;
  }

  return token;
}
