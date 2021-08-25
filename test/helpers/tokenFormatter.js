export default function formatBearer(token) {
  if (!token) {
    return null;
  }

  return `Bearer ${token}`;
}
