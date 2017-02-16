export const STATUS_UNAUTHORIZED = 401;
export const STATUS_OK = 200;

function isResponseStatus(response, status) {
  if (!response) {
    return false;
  }

  return response['status'] === status;
}

export function isResponseOk(response) {
  return isResponseStatus(response, STATUS_OK);
}

export function isResponseUnauthorized(response) {
  return isResponseStatus(response, STATUS_UNAUTHORIZED);
}
