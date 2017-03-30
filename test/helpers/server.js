import express from 'express';

let app = express();
let server = null;

const EXPIRED_TOKEN = 'token1';
const VALID_TOKEN = 'token2';

let currentToken = EXPIRED_TOKEN;
let currentRefreshToken = 'refresh_token';

app.get('/200', function(req, res) {
  res.send();
});

function handleUnauthorizedRequest(req, res ){
  const response = () => {
    const token = req.header('authorization') && req.header('authorization').split(' ')[1];

    if (token === EXPIRED_TOKEN) {
      res.status(401).send();
    } else if (token === VALID_TOKEN) {
      if (req.query.invalidate){
        res.set('invalidates-token', true);
      }

      res.json({ 'value': req.params.id });
    } else {
      res.status(401).send();
    }
  };

  const duration = req.query.duration || 0;
  if (duration === 0) {
    response();
  } else {
    setTimeout(response, duration);
  }
}

app.get('/401/:id', handleUnauthorizedRequest);
app.post('/401/:id', handleUnauthorizedRequest);

app.get('/headers', function(req, res) {
  res.json(req.headers);
});

app.get('/token', function(req, res) {
  const response = () => {
    // exchange refresh token for new access token
    if (req.header('authorization') === `Bearer ${currentRefreshToken}`){
      currentToken = req.query.invalid ? 'invalid_token' : VALID_TOKEN;

      res.json({
        'accessToken': currentToken,
      });
    } else {
      res.status(401).send();
    }
  };

  const duration = req.query.duration || 0;
  if (duration === 0) {
    response();
  } else {
    setTimeout(response, duration);
  }
});

export function start(done) {
  server = app.listen(5000, done);
}

export function stop(done) {
  server.close(done);
}
