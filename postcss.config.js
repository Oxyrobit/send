const TailwindExtractor = content => {
  return content.match(/[A-Za-z0-9-_:/]+/g) || [];
};

const options = {
  plugins: [
    require('tailwindcss')('./tailwind.config.js'),
    require('postcss-preset-env')
  ]
};

if (process.env.NODE_ENV === 'development') {
  options.map = { inline: true };
} else {
  options.plugins.push(
    require('@fullhuman/postcss-purgecss')({
      content: [
        './app/*.ts',
        './app/ui/*.ts',
        './android/*.js',
        './android/pages/*.js'
      ],
      extractors: [
        {
          extractor: TailwindExtractor,
          extensions: ['js', 'ts']
        }
      ]
    })
  );
  options.plugins.push(
    require('cssnano')({
      preset: 'default'
    })
  );
}

module.exports = options;
