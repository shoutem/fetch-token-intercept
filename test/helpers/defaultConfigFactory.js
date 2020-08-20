import formatBearer from './tokenFormatter';

export default function(config) {
  return {
    fetchRetryCount: 1,
    createAccessTokenRequest: refreshToken =>
      new Request('http://localhost:5000/token', {
        headers: {
          authorization: `Bearer ${refreshToken}`
        }
      }),
    shouldIntercept: request => request.url.toString() !== 'http://localhost:5000/token',
    parseAccessToken: response =>
      response.json().then(jsonData => jsonData ? jsonData.accessToken : null),
    authorizeRequest: (request, token) => {
      request.headers.set('authorization', formatBearer(token));
      return request;
    },
    onAccessTokenChange: null,
    onResponse: null,
    isResponseUnauthorized: response => response.status === 401,
    ...config,
  };
}
