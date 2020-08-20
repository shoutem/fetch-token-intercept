require('babel-register')({
  presets: ['es2015'],
  plugins: [
    'transform-object-rest-spread',
    ['babel-plugin-transform-builtin-extend', { globals: ['Error', 'Array'] }],
  ],
  sourceMaps: 'both',
});
