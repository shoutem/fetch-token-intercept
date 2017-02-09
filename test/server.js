import express from 'express';

let app = express();
let server = null;

let currentToken = 'token1';
let currentRefreshToken = 'refresh_token';

app.get('/200', function(req, res) {
  res.send();
});

app.get('/401/:id', function(req, res) {
  const token = req.header('Authorization') && req.header('Authorization').split(' ')[1];
  if (token === 'token1') {
    res.status(401).send();
  } else if (token === 'token2') {
    res.json({ "value": req.params.id });
  } else {
    res.status(401).send();
  }
});

app.get('/token', function(req, res) {
  if (req.header('Authorization') === `Bearer ${currentRefreshToken}`){
    currentToken = 'token2';
    res.json({
      'accessToken': currentToken
    })
  } else {
    res.status(401).send();
  }
});

export function start(done) {
  server = app.listen(5000, done);
}

export function stop(done) {
  server.close(done);
}
