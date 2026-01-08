module.exports = {
  entry: {
    code: './src/code.ts',
  },
  performance: false,
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    chunkFilename: 'code.js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
          },
        },
        type: 'javascript/auto',
      },
    ],
  },
}
