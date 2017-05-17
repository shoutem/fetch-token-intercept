# fetch-token-intercept
Library for easy renewing of access tokens in OAuth's refresh token flow. This library will monkey
patch fetch on your target environment and will try to resolve unauthorized requests automatically
by renewing the current access token and then retrying an initial fetch operation.

If you are not familiar with refresh token flow you should check some of the following resources:
- [RFC standards track regarding refresh token flow](https://tools.ietf.org/html/rfc6749#page-10)
- [Auth0 blog - Refresh Tokens: When to Use Them and How They Interact with JWTs](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)

>Note:
This library expects that fetch and promise api's are available at target environment. You should
provide a polyfill when necessary.

## Installation

`fetch-token-intercept` is available on [npm](https://www.npmjs.com/package/@shoutem/fetch-token-intercept).

```
$ npm install @shoutem/fetch-token-intercept --save
```

## Getting started

Before making any fetch requests you should `configure` and `authorize` this library to support
interception.

Configuration is provided via `config` object:

```
config: {
  // (Required) Prepare fetch request for renewing new access token
  createAccessTokenRequest: (refreshToken) => request,
   
  // (Required) Parses access token from access token response
  parseAccessToken: (response) => accessToken,
   
  // (Required) Defines whether interceptor will intercept this request or just let it pass through
  shouldIntercept: (request) => boolean,
   
  // (Required) Defines whether access token will be invalidated after this response
  shouldInvalidateAccessToken: (response) => boolean,
  
  // When set, response which invalidates token will be resolved after the token has been renewed
  // in effect, token will be loaded in sync with response, otherwise renew will run async to response
  shouldWaitForTokenRenewal: boolean,
   
  // (Required) Adds authorization for intercepted requests
  authorizeRequest: (request, accessToken) => authorizedRequest,
   
  // Number of retries after initial request was unauthorized
  fetchRetryCount: 1,
  
  // Event invoked when access token has changed
  onAccessTokenChange: null,
   
  // Event invoked when response is resolved
  onResponse: null,
}
```

All required methods return a promise to enable reading of request or response body.
You should avoid reading the body directly on provided requests and responses and instead clone 
them first. The library does not clone objects to avoid unnecessary overhead in cases where 
reading a body is not required to provide data.

To configure the interceptor you should import and call `configure` function. And when you obtain
a refresh token you should call `authorize`, which accepts refresh and access tokens.

```
   import { configure, authorize } from '@shoutem/fetch-token-intercept';

   ...
   configure(configuration);
   // perform authentication with user credentials against your auth server
   // when you recieve refresh token (and optionally access token) provide them to interceptor lib
   authorize(refreshToken, accessToken);
   ...
```

User is now logged in with provided refresh token. If refresh token invalidates interceptor
will automatically clear both tokens and further requests won't be intercepted. You should redirect
user to authentication screen and re-authorize interceptor on successful authentication.

To manually clear tokens you can call clear method. You should call this when user log outs manually
to stop fetch interception.

```
   import { clear } from '@shoutem/fetch-token-intercept';

   ...
   clear();
   ...
```

## API reference

### Exports
 `configure(configuration)`
 
 Configures fetch token interceptor with provided configuration object.
 
 `authorize(refreshToken, accessToken)` 
  
  Authorizes fetch token interceptor with provided tokens.
  
 `clear()`
 
 Clears all tokens from interceptor.
 
## Tests

```
$ npm install && npm run test
``` 

## License
 
 BSD
